const fs = require('fs')
const path = require('path')
const os = require('os')

const MAX_FILE = 512 * 1024 ** 2
const MAX_TOTAL = 3 * 1024 ** 3

function lz4(src, size) {
  const out = Buffer.allocUnsafe(size)
  let si = 0
  let di = 0
  while (si < src.length) {
    const token = src[si++]
    let literals = token >> 4
    if (literals === 15) {
      let b
      do {
        b = src[si++]
        literals += b
      } while (b === 255)
    }
    src.copy(out, di, si, si + literals)
    di += literals
    si += literals
    if (si >= src.length) break
    const offset = src[si] | (src[si + 1] << 8)
    si += 2
    let match = token & 15
    if (match === 15) {
      let b
      do {
        b = src[si++]
        match += b
      } while (b === 255)
    }
    match += 4
    let from = di - offset
    for (let k = 0; k < match; k++) out[di++] = out[from++]
  }
  return out.subarray(0, di)
}

function inflate(chunk, kind, size) {
  if (kind === 0) return chunk
  if (kind === 2 || kind === 3) return lz4(chunk, size)
  return null
}

function readUnityFS(buf) {
  let o = 0
  const cstr = () => {
    const end = buf.indexOf(0, o)
    const s = buf.toString('latin1', o, end)
    o = end + 1
    return s
  }
  if (cstr() !== 'UnityFS') return null
  const version = buf.readUInt32BE(o)
  o += 4
  cstr()
  cstr()
  o += 8
  const packedInfo = buf.readUInt32BE(o)
  const infoSize = buf.readUInt32BE(o + 4)
  const flags = buf.readUInt32BE(o + 8)
  o += 12
  if (version >= 7) o = (o + 15) & ~15

  let infoChunk
  if (flags & 0x80) {
    infoChunk = buf.subarray(buf.length - packedInfo)
  } else {
    infoChunk = buf.subarray(o, o + packedInfo)
    o += packedInfo
  }
  const info = inflate(infoChunk, flags & 0x3f, infoSize)
  if (!info) return null
  if (flags & 0x200) o = (o + 15) & ~15

  const blocks = info.readInt32BE(16)
  const parts = []
  let p = 20
  for (let i = 0; i < blocks; i++) {
    const size = info.readUInt32BE(p)
    const packed = info.readUInt32BE(p + 4)
    const kind = info.readUInt16BE(p + 8) & 0x3f
    p += 10
    const chunk = buf.subarray(o, o + packed)
    o += packed
    const data = inflate(chunk, kind, size)
    if (data) parts.push(data)
  }
  return Buffer.concat(parts)
}

function serializedStrings(buf, push) {
  const end = buf.length - 4
  for (let i = 0; i < end; i += 4) {
    const len = buf.readInt32LE(i)
    if (len < 2 || len > 8000 || i + 4 + len > buf.length) continue
    const first = buf[i + 4]
    if (first < 0x20 && first !== 0x0a) continue
    const slice = buf.subarray(i + 4, i + 4 + len)
    if (slice.includes(0)) continue
    const text = slice.toString('utf8')
    if (text.includes('�')) continue
    push(text)
    i += (len + 3) & ~3
  }
}

function metadataStrings(buf, push) {
  if (buf.readUInt32LE(0) !== 0xfab11baf) return
  const listOffset = buf.readUInt32LE(8)
  const listSize = buf.readUInt32LE(12)
  const dataOffset = buf.readUInt32LE(16)
  for (let p = listOffset; p < listOffset + listSize; p += 8) {
    const length = buf.readUInt32LE(p)
    const index = buf.readInt32LE(p + 4)
    if (length < 2 || length > 8000) continue
    push(buf.toString('utf8', dataOffset + index, dataOffset + index + length))
  }
}

function userStrings(buf, push) {
  try {
    const pe = buf.readUInt32LE(0x3c)
    const magic = buf.readUInt16LE(pe + 24)
    const dirs = pe + 24 + (magic === 0x20b ? 112 : 96)
    const cliRva = buf.readUInt32LE(dirs + 14 * 8)
    const sections = pe + 24 + buf.readUInt16LE(pe + 20)
    const count = buf.readUInt16LE(pe + 6)
    const toOffset = rva => {
      for (let s = 0; s < count; s++) {
        const h = sections + s * 40
        const va = buf.readUInt32LE(h + 12)
        const size = buf.readUInt32LE(h + 8)
        if (rva >= va && rva < va + size) return rva - va + buf.readUInt32LE(h + 20)
      }
      return -1
    }
    const cli = toOffset(cliRva)
    const root = toOffset(buf.readUInt32LE(cli + 8))
    const versionLength = buf.readUInt32LE(root + 12)
    let p = root + 16 + versionLength + 2
    const streams = buf.readUInt16LE(p)
    p += 2
    for (let s = 0; s < streams; s++) {
      const offset = buf.readUInt32LE(p)
      const size = buf.readUInt32LE(p + 4)
      const nameEnd = buf.indexOf(0, p + 8)
      const name = buf.toString('latin1', p + 8, nameEnd)
      p = (nameEnd + 4) & ~3
      if (name !== '#US') continue
      let q = root + offset + 1
      const stop = root + offset + size
      while (q < stop) {
        let len = buf[q]
        if ((len & 0x80) === 0) q += 1
        else if ((len & 0xc0) === 0x80) {
          len = ((len & 0x3f) << 8) | buf[q + 1]
          q += 2
        } else {
          len = ((len & 0x1f) << 24) | (buf[q + 1] << 16) | (buf[q + 2] << 8) | buf[q + 3]
          q += 4
        }
        if (len > 1) push(buf.toString('utf16le', q, q + len - 1))
        q += len
      }
    }
  } catch {}
}

function textPieces(text, push) {
  if (/^\s*[[{]/.test(text)) {
    for (const m of text.matchAll(/"((?:[^"\\]|\\.){2,2000})"/g)) {
      try {
        push(JSON.parse(`"${m[1]}"`))
      } catch {}
    }
    return
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 2) continue
    if (/[,;\t]/.test(line) && /"/.test(line)) {
      for (const m of line.matchAll(/"((?:[^"]|"")+)"/g)) push(m[1].replace(/""/g, '"'))
    } else if (line.includes('\t')) {
      for (const cell of line.split('\t')) push(cell)
    } else {
      push(line)
    }
  }
}

const SCRIPT = {
  latin: /[A-Za-z]/,
  ja: /[ぁ-ヿ]/,
  zh: /[一-鿿]/,
  ko: /[가-힣]/,
  cyrillic: /[Ѐ-ӿ]/
}

function scriptOf(lang) {
  if (lang === 'ja') return 'ja'
  if (lang === 'ko') return 'ko'
  if (lang.startsWith('zh')) return 'zh'
  if (['ru', 'uk', 'be', 'bg', 'sr', 'mk', 'kk', 'ky', 'tg', 'mn'].includes(lang)) return 'cyrillic'
  return 'latin'
}

const ENGLISH = new Set(
  "the a an and or but if of to in on at for with from by is are was were be been being it its it's this that these those you you're your i i'm me my we our us he she they them his her not no yes do does did done don't can can't could will won't would should have has had what where when who why how all any some more most other new just only get got go goes going come back there here up down out over into than then now about as so too very off again use press hold start game play level menu please thanks let's let still even also really maybe sure okay ok".split(
    ' '
  )
)

function englishLike(s) {
  if (/[À-ÖØ-öø-ÿĀ-ž¡¿]/.test(s)) return false
  const words =
    s
      .toLowerCase()
      .replace(/[’]/g, "'")
      .match(/[a-z']+/g) || []
  if (words.length < 3) return true
  const common = words.filter(w => ENGLISH.has(w)).length
  return common >= 1 && common / words.length >= 0.25
}

const NOISE =
  /(:\/\/|\.(png|jpg|tga|prefab|asset|mat|shader|dll|json|wav|ogg|mp3|unity|controller|anim)\b|Assets\/|UnityEngine|System\.|\{\d+\}|%[sd]|\bnull\b|^\s|\s$|[<>]|\\[nrt"])/i

function looksLikeText(s, script, lang) {
  if (s.length < 2 || s.length > 1500) return false
  if (/[\u0000-\u0009\u000b-\u001f�]/.test(s)) return false
  if (NOISE.test(s)) return false
  if (!SCRIPT[script].test(s)) return false

  if (script === 'latin') {
    if (/[぀-ヿ一-鿿가-힣]/.test(s)) return false
    const letters = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length
    if (letters / s.length < 0.55) return false
    if (lang === 'en' && !englishLike(s)) return false
    if (!s.includes(' ')) return /^[A-Z][a-z]{2,15}[!?.]?$/.test(s) || /^[A-Z]{3,14}[!?]?$/.test(s)
    const words = s.split(/\s+/)
    if (words.some(w => /[a-z][A-Z]|_|[a-z]\d|\d[a-z]/.test(w))) return false
    return words.filter(w => /^[A-Za-z'’-]{2,}[,.!?:;…]*$/.test(w)).length >= Math.max(2, words.length * 0.6)
  }
  const native = (s.match(script === 'cyrillic' ? /[Ѐ-ӿ]/g : /[ぁ-ヿ一-鿿가-힣]/g) || []).length
  return native >= 2 && native / s.replace(/\s/g, '').length >= 0.3
}

function* walk(dir, depth = 6) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (depth > 0) yield* walk(full, depth - 1)
    } else if (e.isFile()) {
      yield full
    }
  }
}

function sources(game, appInfo) {
  const list = []
  const data = game.dataDir
  for (const f of walk(data, 0)) {
    const name = path.basename(f)
    if (/\.(resS|resource)$/i.test(name)) continue
    if (/^(level\d+|.+\.assets|data\.unity3d|mainData|globalgamemanagers)$/i.test(name)) list.push(f)
  }
  const metadata = path.join(data, 'il2cpp_data', 'Metadata', 'global-metadata.dat')
  if (fs.existsSync(metadata)) list.push(metadata)
  for (const dll of ['Assembly-CSharp.dll', 'Assembly-CSharp-firstpass.dll']) {
    const file = path.join(data, 'Managed', dll)
    if (fs.existsSync(file)) list.push(file)
  }
  for (const f of walk(path.join(data, 'StreamingAssets'))) list.push(f)
  if (appInfo.company && appInfo.product) {
    const low = path.join(os.homedir(), 'AppData', 'LocalLow')
    for (const f of walk(path.join(low, 'Unity', `${appInfo.company}_${appInfo.product}`))) list.push(f)
    for (const f of walk(path.join(low, appInfo.company, appInfo.product))) list.push(f)
  }
  return list
}

function head(file, n) {
  const fd = fs.openSync(file, 'r')
  try {
    const b = Buffer.alloc(n)
    fs.readSync(fd, b, 0, n, 0)
    return b
  } finally {
    fs.closeSync(fd)
  }
}

async function collect(game, appInfo, sourceLang, { onProgress, signal, limit = 40000 } = {}) {
  const script = scriptOf(sourceLang)
  const found = new Map()
  let weight = 0
  const push = raw => {
    if (typeof raw !== 'string') return
    if (raw.length > 300 && raw.includes('\n')) {
      textPieces(raw, s => push(s.length > 300 && s.includes('\n') ? '' : s))
      return
    }
    if (looksLikeText(raw, script, sourceLang)) found.set(raw, Math.max(found.get(raw) ?? -1000, weight))
  }

  const files = sources(game, appInfo)
  let scanned = 0
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) break
    const file = files[i]
    let size = 0
    try {
      size = fs.statSync(file).size
    } catch {
      continue
    }
    if (size < 16 || size > MAX_FILE || scanned > MAX_TOTAL) continue
    const name = path.basename(file).toLowerCase()
    try {
      if (/\.(json|txt|csv|tsv|xml|yaml|yml|lang|loc|po)$/.test(name)) {
        if (size < 32 << 20) textPieces(fs.readFileSync(file, 'utf8'), push)
      } else if (name === 'global-metadata.dat') {
        weight = -400
        metadataStrings(fs.readFileSync(file), push)
        weight = 0
      } else if (name.endsWith('.dll')) {
        userStrings(fs.readFileSync(file), push)
      } else {
        const sig = head(file, 8).toString('latin1')
        const isBundle = sig.startsWith('UnityFS')
        const isSerialized = /\.assets$|^level\d+$|^globalgamemanagers$|^maindata$/.test(name)
        if (!isBundle && !isSerialized) continue
        const buf = fs.readFileSync(file)
        const body = isBundle ? readUnityFS(buf) : buf
        if (body) serializedStrings(body, push)
      }
      scanned += size
    } catch {}
    onProgress?.(i + 1, files.length)
    if (i % 8 === 0) await new Promise(r => setImmediate(r))
  }

  return [...found.entries()]
    .sort((a, b) => score(b[0]) + b[1] - (score(a[0]) + a[1]))
    .slice(0, limit)
    .map(([text]) => text)
}

function score(s) {
  let v = Math.min(s.length, 200)
  if (/[.!?…。！？]$/.test(s)) v += 60
  if (s.includes(' ')) v += 30
  return v
}

module.exports = { collect, readUnityFS, looksLikeText, scriptOf }
