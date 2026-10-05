const fs = require('fs')
const path = require('path')
const ini = require('./ini.cjs')
const steam = require('./steam.cjs')

const exists = p => {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

const list = dir => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function isDataDir(dir) {
  return ['globalgamemanagers', 'data.unity3d', 'mainData', 'level0'].some(f => exists(path.join(dir, f)))
}

function findGameIn(dir) {
  for (const entry of list(dir)) {
    if (!entry.isDirectory() || !entry.name.endsWith('_Data')) continue
    const base = entry.name.slice(0, -5)
    const exe = path.join(dir, `${base}.exe`)
    const dataDir = path.join(dir, entry.name)
    if (exists(exe) && isDataDir(dataDir)) return { root: dir, exe, dataDir, exeName: base }
  }
  return null
}

function locate(input) {
  let target = path.resolve(
    String(input || '')
      .trim()
      .replace(/^"+|"+$/g, '')
  )
  if (!exists(target)) return null
  if (fs.statSync(target).isFile()) target = path.dirname(target)
  if (target.endsWith('_Data') && isDataDir(target)) target = path.dirname(target)

  const direct = findGameIn(target)
  if (direct) return direct

  const queue = list(target)
    .filter(e => e.isDirectory())
    .map(e => path.join(target, e.name))
  if (queue.length > 200) return null
  for (const dir of queue) {
    const found = findGameIn(dir)
    if (found) return found
  }
  let budget = 400
  for (const dir of queue) {
    for (const sub of list(dir).filter(e => e.isDirectory())) {
      if (--budget < 0) return null
      const found = findGameIn(path.join(dir, sub.name))
      if (found) return found
    }
  }
  return null
}

function readHead(file, size) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(size)
    const n = fs.readSync(fd, buf, 0, size, 0)
    return buf.subarray(0, n)
  } finally {
    fs.closeSync(fd)
  }
}

function peMachine(file) {
  try {
    const head = readHead(file, 4096)
    if (head.readUInt16LE(0) !== 0x5a4d) return null
    const pe = head.readUInt32LE(0x3c)
    const machine = head.readUInt16LE(pe + 4)
    if (machine === 0x8664) return 'x64'
    if (machine === 0x14c) return 'x86'
    if (machine === 0xaa64) return 'arm64'
  } catch {}
  return null
}

function unityVersion(dataDir) {
  for (const name of ['globalgamemanagers', 'data.unity3d', 'mainData', 'level0']) {
    const file = path.join(dataDir, name)
    if (!exists(file)) continue
    const text = readHead(file, 8192).toString('latin1')
    const match = text.match(/\b(20\d\d|6\d\d\d|5|4|3)\.\d{1,2}\.\d{1,3}[abfpxc]\d{1,3}\b/)
    if (match) return match[0]
  }
  return null
}

const ANTI_CHEAT = [
  { name: 'EasyAntiCheat', test: n => /^easyanticheat/i.test(n) || n === 'start_protected_game.exe' },
  { name: 'BattlEye', test: n => /^battleye$/i.test(n) || /^beservice/i.test(n) || /_be\.exe$/i.test(n) },
  { name: 'nProtect GameGuard', test: n => /^gameguard$/i.test(n) || /^gamemon/i.test(n) },
  { name: 'XIGNCODE3', test: n => /^xigncode/i.test(n) || /^x3\.xem$/i.test(n) },
  { name: 'ACE (Anti-Cheat Expert)', test: n => /^anticheatexpert$/i.test(n) || /^ace-/i.test(n) || /^sguard/i.test(n) },
  { name: 'mhyprot', test: n => /^mhyprot/i.test(n) || /^mhypbase\.dll$/i.test(n) },
  { name: 'HoYoProtect', test: n => /^hoyokprotect/i.test(n) },
  { name: 'NetEase Protect', test: n => /^neac/i.test(n) },
  { name: 'Tencent Protect', test: n => /^tenprotect$/i.test(n) || /^tersafe/i.test(n) || /^tp3helper/i.test(n) },
  { name: 'Denuvo Anti-Cheat', test: n => /^denuvo.?anti.?cheat/i.test(n) },
  { name: 'EQU8', test: n => /^equ8/i.test(n) },
  { name: 'PunkBuster', test: n => /^pbsvc/i.test(n) || /^pnkbstr/i.test(n) },
  { name: 'HackShield', test: n => /^hshield$/i.test(n) || /^ehsvc\.dll$/i.test(n) },
  { name: 'Anybrain', test: n => /^anybrain/i.test(n) },
  { name: 'FACEIT', test: n => /^faceit/i.test(n) }
]

function findAntiCheat(root) {
  const found = new Set()
  const scan = (dir, depth) => {
    for (const entry of list(dir)) {
      for (const sig of ANTI_CHEAT) if (sig.test(entry.name)) found.add(sig.name)
      if (depth > 0 && entry.isDirectory() && !entry.name.endsWith('_Data') && entry.name !== 'BepInEx') {
        scan(path.join(dir, entry.name), depth - 1)
      }
    }
  }
  scan(root, 1)
  return [...found]
}

function appInfo(dataDir) {
  const file = path.join(dataDir, 'app.info')
  if (!exists(file)) return {}
  const [company, product] = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  return { company: company?.trim(), product: product?.trim() }
}

function sampleFiles(game, backend) {
  const files = []
  const add = (file, limit, encoding = 'utf8') => {
    if (exists(file)) files.push({ file, limit, encoding })
  }
  add(path.join(game.dataDir, 'resources.assets'), 32 << 20)
  add(path.join(game.dataDir, 'sharedassets0.assets'), 6 << 20)
  add(path.join(game.dataDir, 'level0'), 4 << 20)
  if (backend === 'il2cpp') add(path.join(game.dataDir, 'il2cpp_data', 'Metadata', 'global-metadata.dat'), 24 << 20)
  else add(path.join(game.dataDir, 'Managed', 'Assembly-CSharp.dll'), 16 << 20, 'utf16le')
  const streaming = path.join(game.dataDir, 'StreamingAssets')
  const walk = (dir, depth) => {
    for (const e of list(dir)) {
      const full = path.join(dir, e.name)
      if (e.isDirectory() && depth > 0) walk(full, depth - 1)
      else if (/\.(json|txt|csv|tsv|xml|yaml|yml|lang|loc)$/i.test(e.name)) add(full, 2 << 20)
      if (files.length > 40) return
    }
  }
  walk(streaming, 2)
  return files
}

const PHRASES = {
  latin: /[A-Z][a-z]+(?: [a-z']+){3,}[.!?]/g,
  ja: /[ぁ-ヿ]{4,}/g,
  ko: /[가-힣]{2,}(?: [가-힣]{1,}){2,}/g,
  zh: /[一-鿿]{6,}/g,
  ru: /[А-ЯЁ][а-яё]+(?: [а-яё]+){3,}[.!?]/g
}

function detectLanguage(game, backend) {
  const counts = { latin: 0, ja: 0, ko: 0, zh: 0, ru: 0 }
  for (const { file, limit, encoding } of sampleFiles(game, backend)) {
    let text
    try {
      text = readHead(file, limit).toString(encoding)
    } catch {
      continue
    }
    for (const [key, re] of Object.entries(PHRASES)) counts[key] += (text.match(re) || []).length
  }
  const asian = Math.max(counts.ja, counts.ko, counts.zh)
  const chinese = counts.zh > counts.ja * 2 ? counts.zh : 0
  const scripts = [counts.latin, counts.ja, counts.ko, counts.ru, chinese].filter(n => n >= 100).length
  if (counts.latin >= 100 && scripts >= 3) return { code: 'en', counts }
  if (counts.latin >= 100 && counts.latin >= asian * 0.3 && counts.latin >= counts.ru) return { code: 'en', counts }
  if (counts.ru >= 100 && counts.ru >= asian) return { code: 'ru', counts }
  if (counts.ja >= 100 && counts.ja >= counts.zh * 0.25) return { code: 'ja', counts }
  if (counts.ko >= 100 && counts.ko >= counts.zh) return { code: 'ko', counts }
  if (counts.zh >= 100) return { code: 'zh-CN', counts }
  return { code: 'en', counts }
}

function readManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'BepInEx', '.ugl.json'), 'utf8'))
  } catch {
    return null
  }
}

function lastRun(root) {
  const log = path.join(root, 'BepInEx', 'LogOutput.log')
  if (!exists(log)) return null
  const text = fs.readFileSync(log, 'utf8')
  return {
    at: fs.statSync(log).mtimeMs,
    loaded: /Loaded XUnity\.AutoTranslator/i.test(text) || /Loading \[XUnity Auto Translator/i.test(text),
    errors: (text.match(/^\[(Error|Fatal)\s*:/gm) || []).length
  }
}

function countTranslations(root, language) {
  if (!language) return 0
  const dir = path.join(root, 'BepInEx', 'Translation', language, 'Text')
  let total = 0
  for (const entry of list(dir)) {
    if (!entry.isFile() || !entry.name.endsWith('.txt') || /^_(Substitutions|Preprocessors|Postprocessors)/i.test(entry.name)) continue
    try {
      total += fs
        .readFileSync(path.join(dir, entry.name), 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('//')).length
    } catch {}
  }
  return total
}

function installState(game) {
  const root = game.root
  const loaderOn = exists(path.join(root, 'winhttp.dll')) || exists(path.join(root, 'version.dll'))
  const loaderOff = exists(path.join(root, 'winhttp.dll.disabled')) || exists(path.join(root, 'version.dll.disabled'))
  const core = path.join(root, 'BepInEx', 'core')
  let bepinex = null
  if (exists(path.join(core, 'BepInEx.dll'))) bepinex = 5
  else if (exists(path.join(core, 'BepInEx.Core.dll'))) bepinex = 6
  const il2cppFlavor = exists(path.join(core, 'BepInEx.Unity.IL2CPP.dll')) || exists(path.join(core, 'BepInEx.IL2CPP.dll'))
  const xunity = exists(path.join(root, 'BepInEx', 'plugins', 'XUnity.AutoTranslator'))
  const melon = exists(path.join(root, 'MelonLoader'))
  const config = ini.read(path.join(root, 'BepInEx', 'config', 'AutoTranslatorConfig.ini'))

  let status = 'none'
  if (xunity && bepinex) status = loaderOn ? 'installed' : loaderOff ? 'disabled' : 'broken'
  else if (bepinex) status = 'foreign'
  const language = ini.get(config, 'General', 'Language') || null

  return {
    status,
    bepinex,
    il2cppFlavor,
    xunity,
    melon,
    manifest: readManifest(root),
    language,
    fromLanguage: ini.get(config, 'General', 'FromLanguage') || null,
    endpoint: ini.get(config, 'Service', 'Endpoint') || null,
    font: ini.get(config, 'Behaviour', 'FallbackFontTextMeshPro') || null,
    translations: status === 'none' ? 0 : countTranslations(root, language),
    lastRun: lastRun(root)
  }
}

function analyze(input, { withLanguage = true } = {}) {
  const game = locate(input)
  if (!game) return { ok: false, error: 'not_unity' }

  const il2cpp = exists(path.join(game.root, 'GameAssembly.dll')) || exists(path.join(game.dataDir, 'il2cpp_data'))
  const mono = exists(path.join(game.dataDir, 'Managed'))
  const backend = il2cpp ? 'il2cpp' : mono ? 'mono' : null

  const playerDll = path.join(game.root, 'UnityPlayer.dll')
  const arch = peMachine(exists(playerDll) ? playerDll : game.exe) || peMachine(game.exe)

  const info = appInfo(game.dataDir)
  const steamApp = steam.findApp(game.root)

  return {
    ok: true,
    root: game.root,
    exe: game.exe,
    dataDir: game.dataDir,
    folder: path.basename(game.root),
    name: steamApp?.name || info.product || game.exeName,
    company: info.company || null,
    product: info.product || null,
    backend,
    arch,
    unityVersion: unityVersion(game.dataDir),
    antiCheat: findAntiCheat(game.root),
    steamAppId: steamApp?.appId || null,
    sourceLanguage: withLanguage && backend ? detectLanguage(game, backend).code : null,
    install: installState(game)
  }
}

module.exports = { analyze, locate, installState }
