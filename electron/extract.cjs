const fs = require('fs')
const path = require('path')
const os = require('os')
const zlib = require('zlib')
const { lzma } = require('./lzma.cjs')

const MAX_FILE = 1024 * 1024 ** 2
const MAX_TOTAL = 6144 * 1024 ** 2
const MAX_TIME = 240 * 1000
const MAX_STRING = 32 * 1024 ** 2
const SEGMENT = 64 * 1024 ** 2
const OVERLAP = 1024 ** 2
const TEXT_EXT = /\.(json|txt|csv|tsv|xml|yaml|yml|lang|loc|po|ink|yarn|rpy|ks|ini|md|html?|lua|js)$/i

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
  if (kind === 1) return lzma(chunk, size)
  if (kind === 2 || kind === 3) return lz4(chunk, size)
  return null
}

// Calls onChunk with the decompressed blocks of a UnityFS bundle, grouped in big pieces
// that keep 4-byte alignment and overlap a little so strings on a border are not lost.
function readUnityFS(buf, onChunk) {
  let o = 0
  const cstr = () => {
    const end = buf.indexOf(0, o)
    const s = buf.toString('latin1', o, end)
    o = end + 1
    return s
  }
  if (cstr() !== 'UnityFS') return false
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
  if (!info) return false
  if (flags & 0x200) o = (o + 15) & ~15

  const blocks = info.readInt32BE(16)
  let p = 20
  let parts = []
  let pending = 0
  let start = 0
  const flush = last => {
    if (!parts.length) return
    const group = parts.length === 1 ? parts[0] : Buffer.concat(parts)
    onChunk(group)
    parts = []
    pending = 0
    if (last) return
    let cut = Math.max(0, group.length - OVERLAP)
    cut -= (start + cut) % 4
    start += cut
    const tail = Buffer.from(group.subarray(cut))
    parts.push(tail)
    pending = tail.length
  }
  for (let i = 0; i < blocks; i++) {
    const size = info.readUInt32BE(p)
    const packed = info.readUInt32BE(p + 4)
    const kind = info.readUInt16BE(p + 8) & 0x3f
    p += 10
    const chunk = buf.subarray(o, o + packed)
    o += packed
    let data = null
    try {
      data = inflate(chunk, kind, size)
    } catch {}
    if (!data) data = Buffer.alloc(size)
    parts.push(data)
    pending += data.length
    if (pending >= SEGMENT) flush(false)
  }
  flush(true)
  return true
}

// Fast check that bytes [start, end) are text: valid UTF-8 without control characters
// other than tab and line breaks. Fails on the first bad byte, so random binary data is cheap.
function isText(buf, start, end) {
  for (let i = start; i < end; i++) {
    const b = buf[i]
    if (b < 0x80) {
      if (b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09) return false
      continue
    }
    let extra
    if (b >= 0xc2 && b <= 0xdf) extra = 1
    else if (b >= 0xe0 && b <= 0xef) extra = 2
    else if (b >= 0xf0 && b <= 0xf4) extra = 3
    else return false
    if (i + extra >= end) return false
    for (let k = 1; k <= extra; k++) if ((buf[i + k] & 0xc0) !== 0x80) return false
    i += extra
  }
  return true
}

function serializedStrings(buf, push) {
  const end = buf.length - 4
  for (let i = 0; i < end; i += 4) {
    const len = buf.readInt32LE(i)
    if (len < 2 || len > MAX_STRING || i + 4 + len > buf.length) continue
    const from = i + 4
    if (len > 8000 && !isText(buf, from, from + 256)) continue
    if (!isText(buf, from, from + len)) continue
    push(buf.toString('utf8', from, from + len))
    i += (len + 3) & ~3
  }
}

function messagePackStrings(buf, push) {
  const end = buf.length - 3
  for (let i = 0; i < end; i++) {
    const tag = buf[i]
    let start
    let len
    if (tag === 0xd9) {
      start = i + 2
      len = buf[i + 1]
    } else if (tag === 0xda) {
      start = i + 3
      len = buf.readUInt16BE(i + 1)
    } else continue
    if (len < 8 || start + len > buf.length) continue
    const first = buf[start]
    if (first < 0x20 || (first > 0x7e && first < 0xc2) || buf[start + len - 1] < 0x20) continue
    if (!isText(buf, start, start + len)) continue
    push(buf.toString('utf8', start, start + len))
    i = start + len - 1
  }
}

function metadataStrings(buf, push) {
  if (buf.readUInt32LE(0) !== 0xfab11baf) return
  const listOffset = buf.readUInt32LE(8)
  const listSize = buf.readUInt32LE(12)
  const dataOffset = buf.readUInt32LE(16)
  if (listOffset + listSize > buf.length) return
  for (let p = listOffset; p < listOffset + listSize; p += 8) {
    const length = buf.readUInt32LE(p)
    const index = buf.readInt32LE(p + 4)
    if (length < 2 || length > 64000) continue
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

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decodeEntities = s =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

function parseCsv(text, delim) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') {
      quoted = true
    } else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  rows.push(row)
  return rows
}

function csvDelimiter(lines, hint) {
  const sample = lines.filter(l => l.trim()).slice(0, 200)
  if (sample.length < 3) return hint || null
  for (const d of hint ? [hint, '\t', ',', ';', '|'] : ['\t', ',', ';', '|']) {
    const counts = new Map()
    for (const line of sample) {
      const n = line.split(d).length - 1
      counts.set(n, (counts.get(n) || 0) + 1)
    }
    let best = 0
    let bestCount = 0
    for (const [n, c] of counts) {
      if (n > 0 && c > bestCount) {
        best = n
        bestCount = c
      }
    }
    if (best > 0 && bestCount >= sample.length * 0.6) return d
  }
  return hint || null
}

function textPieces(text, push, hint) {
  text = text.replace(/^﻿/, '')
  if (/^\s*[[{]/.test(text)) {
    for (const m of text.matchAll(/"((?:[^"\\]|\\.){0,20000})"/g)) {
      try {
        push(JSON.parse(`"${m[1]}"`))
      } catch {}
    }
    return
  }
  if (/^\s*</.test(text)) {
    for (const m of text.matchAll(/>([^<]{2,20000})</g)) push(decodeEntities(m[1]))
    for (const m of text.matchAll(/<!\[CDATA\[([\s\S]{2,20000}?)\]\]>/g)) push(m[1])
    for (const m of text.matchAll(/\s[\w:.-]+="([^"]{2,4000})"/g)) push(decodeEntities(m[1]))
    return
  }
  const lines = text.split(/\r?\n/)
  const delim = csvDelimiter(lines, hint)
  if (delim) {
    for (const row of parseCsv(text, delim)) for (const cell of row) push(cell)
    return
  }
  for (const line of lines) {
    if (line.length < 2) continue
    push(line)
    // strings inside scripts: say("Hello there"), text = "..."
    if (line.includes('"')) for (const m of line.matchAll(/"((?:[^"\\]|\\.){0,4000})"/g)) push(m[1])
    // "Speaker: line", "key = value", "key: value" (yaml, yarn, ini, lang files)
    const kv = line.match(/^\s*[\w .'-]{1,40}?\s*(?::|=)\s+(.{2,})$/) || line.match(/^\s*[\w.-]{1,60}\s*=\s*(.{2,})$/)
    if (kv) push(kv[1].replace(/^["']|["']$/g, ''))
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
  "the a an and or but if of to in on at for with from by is are was were be been being it its it's this that these those you you're your i i'm me my we our us he she they them his her not no yes do does did done don't can can't could will won't would should have has had what where when who why how all any some more most other new just only get got go goes going come back there here up down out over into than then now about as so too very off again use press hold start game play level menu please thanks let's let still even also really maybe sure okay ok am im ill i'll i've i'd you'll you've we're we'll they're there's that's what's isn't aren't wasn't didn't doesn't haven't hasn't couldn't wouldn't shouldn't think know want need like look see said say tell make take give one two first time way day man oh hey hmm well right yeah him her".split(
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

// rich text tags that games put inside lines: <color=#fff>, </b>, <size=120%>, <sprite name="x">, <#ff0000>
const TAG = /<\/?#?[A-Za-z0-9][^<>\n]{0,80}>|<\/>/g

const NOISE =
  /(:\/\/|\.(png|jpg|jpeg|tga|psd|prefab|asset|mat|shader|dll|json|wav|ogg|mp3|unity|controller|anim|fbx|cs|bytes)\b|Assets\/|UnityEngine|System\.|\{\d+\}|%[sd]|\{[A-Za-z_]\w*\}|\bnull\b)/i

function looksLikeText(raw, script, lang) {
  if (raw.length < 2 || raw.length > 5000) return false
  if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f�]/.test(raw)) return false
  const s = raw.replace(TAG, ' ').replace(/\s+/g, ' ').trim()
  if (s.length < 2 || /[<>]/.test(s) || /\{\s*"|"\s*:|\[\s*"|"\s*,\s*"/.test(s)) return false
  if (NOISE.test(s)) return false
  if (!SCRIPT[script].test(s)) return false

  if (script === 'latin') {
    if (/[぀-ヿ一-鿿가-힣]/.test(s)) return false
    const letters = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length
    if (letters / s.length < 0.55) return false
    if (lang === 'en' && !englishLike(s)) return false
    if (!s.includes(' ')) return /^[A-Z][a-z]{2,15}[!?.…]*$/.test(s) || /^[A-Z]{3,14}[!?]*$/.test(s)
    const words = s.split(' ')
    if (words.some(w => /[a-z][A-Z]|_|[a-z]\d|\d[a-z]/.test(w))) return false
    if (words.length <= 3 && !words.some(w => /[a-zà-ÿ]{3}/.test(w))) return false
    const real = w => /^["'“‘(-]*([A-Za-zÀ-ÿ'’-]{2,}|[IAa])[,.!?:;…"'”’)-]*$/.test(w)
    return words.filter(real).length >= Math.max(2, words.length * 0.6)
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

function sizeOf(file) {
  try {
    return fs.statSync(file).size
  } catch {
    return -1
  }
}

function sources(game, appInfo) {
  const list = []
  const add = (file, rank) => {
    const size = sizeOf(file)
    if (size >= 16) list.push({ file, size, rank })
  }
  const data = game.dataDir
  const textRank = f => (TEXT_EXT.test(f) ? 0 : 3)
  for (const f of walk(data, 0)) {
    const name = path.basename(f)
    if (/\.(resS|resource)$/i.test(name)) continue
    if (/^(level\d+|.+\.assets|data\.unity3d|mainData|globalgamemanagers)$/i.test(name)) add(f, 1)
  }
  for (const f of walk(path.join(data, 'StreamingAssets'), 8)) {
    if (/\.(resS|resource|mp4|webm|mov|ogv|wav|ogg|mp3|bank|wem|bnk|acb|awb|usm|png|jpg|jpeg|ttf|otf|dll|exe)$/i.test(f)) continue
    add(f, textRank(f))
  }
  for (const f of walk(path.join(data, 'Resources'), 2)) if (TEXT_EXT.test(f)) add(f, 0)
  const metadata = path.join(data, 'il2cpp_data', 'Metadata', 'global-metadata.dat')
  if (fs.existsSync(metadata)) add(metadata, 2)
  for (const f of walk(path.join(data, 'Managed'), 0)) {
    const name = path.basename(f)
    if (/^Assembly-CSharp(-firstpass)?\.dll$/i.test(name)) add(f, 2)
  }
  for (const f of walk(game.root, 2)) {
    if (f.startsWith(data) || /[\\/]BepInEx[\\/]/i.test(f)) continue
    if (TEXT_EXT.test(f) && !/(readme|license|licence|changelog|steam_appid|doorstop|eula)/i.test(path.basename(f))) add(f, 0)
  }
  if (appInfo.company && appInfo.product) {
    const low = path.join(os.homedir(), 'AppData', 'LocalLow')
    for (const f of walk(path.join(low, appInfo.company, appInfo.product))) if (!/\.log$/i.test(f)) add(f, textRank(f))
    for (const f of walk(path.join(low, 'Unity', `${appInfo.company}_${appInfo.product}`))) add(f, 3)
  }
  const seen = new Set()
  return list
    .filter(e => {
      const key = e.file.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.rank - b.rank || a.size - b.size)
}

function head(file, n) {
  const fd = fs.openSync(file, 'r')
  try {
    const b = Buffer.alloc(n)
    const read = fs.readSync(fd, b, 0, n, 0)
    return b.subarray(0, read)
  } finally {
    fs.closeSync(fd)
  }
}

function sniffText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le'
  const sample = buf.subarray(0, 65536)
  if (sample.includes(0)) return null
  const text = sample.toString('utf8')
  const bad = (text.match(/[�\u0001-\u0008\u000e-\u001f]/g) || []).length
  return bad <= text.length * 0.002 + 2 ? 'utf8' : null
}

function scanBuffer(buf, name, push) {
  const sig = buf.subarray(0, 8).toString('latin1')
  if (sig.startsWith('UnityFS')) {
    readUnityFS(buf, body => {
      serializedStrings(body, push)
      if (body.length <= SEGMENT + OVERLAP) messagePackStrings(body, push)
    })
    return
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      scanBuffer(zlib.gunzipSync(buf, { maxOutputLength: MAX_FILE }), name.replace(/\.gz$/i, ''), push)
    } catch {}
    return
  }
  if (sig.startsWith('PK\u0003\u0004')) {
    try {
      const AdmZip = require('adm-zip')
      for (const entry of new AdmZip(buf).getEntries()) {
        if (entry.isDirectory || entry.header.size > 256 << 20) continue
        scanBuffer(entry.getData(), entry.entryName.toLowerCase(), push)
      }
    } catch {}
    return
  }
  const isSerialized = /\.assets$|^level\d+$|^globalgamemanagers$|^maindata$|^data\.unity3d$/.test(name)
  if (TEXT_EXT.test(name) || (!isSerialized && sniffText(buf))) {
    const encoding = sniffText(buf) || 'utf8'
    if (buf.length < 64 << 20) textPieces(buf.toString(encoding), push, /\.tsv$/.test(name) ? '\t' : /\.csv$/.test(name) ? ',' : null)
    return
  }
  serializedStrings(buf, push)
  if (buf.length < 96 * 1024 ** 2) messagePackStrings(buf, push)
}

async function collect(game, appInfo, sourceLang, { onProgress, signal, limit = 100000 } = {}) {
  const script = scriptOf(sourceLang)
  const found = new Map()
  let weight = 0
  const add = text => {
    if (looksLikeText(text, script, sourceLang)) found.set(text, Math.max(found.get(text) ?? -1000, weight))
  }
  const push = (raw, depth = 0) => {
    if (typeof raw !== 'string' || raw.length < 2) return
    let text = raw.replace(/^﻿/, '').trim()
    const structured = /^[[{][\s\S]*[\]}]$/.test(text) || /^<[\s\S]*>$/.test(text)
    if (depth === 0 && ((text.length > 300 && text.includes('\n')) || (structured && text.length > 40))) {
      // a whole file or text asset: take it apart, but keep short plain texts whole as well
      if (text.length <= 2000 && !/^[[{<]/.test(text)) add(text)
      textPieces(text, s => push(s, 1))
      return
    }
    if (text.startsWith('^')) text = text.slice(1).trim() // ink
    text = text.replace(/\s+#[\w-]+:[\w-]+(\s+#[\w-]+(:[\w-]+)?)*$/, '') // yarn line tags
    if (/\\[nrt"]/.test(text) && !/[\n\r]/.test(text)) {
      text = text
        .replace(/\\r\\n|\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\"/g, '"')
        .trim()
    }
    if (/\\[nrt"]/.test(text)) return
    add(text)
  }

  const files = sources(game, appInfo)
  const started = Date.now()
  let scanned = 0
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) break
    const { file, size } = files[i]
    if (Date.now() - started > MAX_TIME) break
    if (size > MAX_FILE || scanned + size > MAX_TOTAL) continue
    const name = path.basename(file).toLowerCase()
    try {
      if (name === 'global-metadata.dat') {
        weight = -400
        metadataStrings(fs.readFileSync(file), push)
        weight = 0
      } else if (name.endsWith('.dll')) {
        userStrings(fs.readFileSync(file), push)
      } else {
        const sig = head(file, 8)
        const isBundle = sig.toString('latin1').startsWith('UnityFS')
        const isSerialized = /\.assets$|^level\d+$|^globalgamemanagers$|^maindata$|^data\.unity3d$/.test(name)
        const isPacked = (sig[0] === 0x1f && sig[1] === 0x8b) || sig.toString('latin1').startsWith('PK\u0003\u0004')
        if (isBundle || isSerialized || isPacked || TEXT_EXT.test(name) || size < 256 << 20) {
          scanBuffer(fs.readFileSync(file), name, push)
        }
      }
      scanned += size
    } catch {
      weight = 0
    }
    onProgress?.(i + 1, files.length)
    await new Promise(r => setImmediate(r))
  }

  return [...found.entries()]
    .sort((a, b) => score(b[0]) + b[1] - (score(a[0]) + a[1]))
    .slice(0, limit)
    .map(([text]) => text)
}

function score(s) {
  let v = Math.min(s.length, 200)
  if (/[.!?…。！？"”」』]$/.test(s)) v += 60
  if (s.includes(' ')) v += 30
  return v
}

module.exports = { collect, readUnityFS, looksLikeText, scriptOf, textPieces }
