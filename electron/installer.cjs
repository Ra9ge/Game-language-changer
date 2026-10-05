const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const AdmZip = require('adm-zip')
const packages = require('./packages.cjs')
const net = require('./net.cjs')
const ini = require('./ini.cjs')
const { analyze } = require('./game.cjs')
const { pretranslate } = require('./pretranslate.cjs')

const LOADER_FILES = ['winhttp.dll', 'winhttp.dll.disabled', 'doorstop_config.ini', '.doorstop_version', 'changelog.txt', 'dotnet', 'BepInEx']
const XUNITY_PATHS = [
  'BepInEx/plugins/XUnity.AutoTranslator',
  'BepInEx/plugins/XUnity.ResourceRedirector',
  'BepInEx/core/XUnity.Common.dll',
  'BepInEx/config/AutoTranslatorConfig.ini'
]
const LATIN_LANGS = new Set([
  'af',
  'sq',
  'az',
  'eu',
  'bs',
  'ca',
  'ceb',
  'co',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'eo',
  'et',
  'fi',
  'fr',
  'fy',
  'gl',
  'de',
  'ht',
  'ha',
  'haw',
  'hmn',
  'hu',
  'is',
  'ig',
  'id',
  'ga',
  'it',
  'jw',
  'ku',
  'la',
  'lv',
  'lt',
  'lb',
  'mg',
  'ms',
  'mt',
  'mi',
  'no',
  'ny',
  'pl',
  'pt',
  'ro',
  'sm',
  'gd',
  'st',
  'sn',
  'sk',
  'sl',
  'so',
  'es',
  'su',
  'sw',
  'sv',
  'tl',
  'tr',
  'uz',
  'vi',
  'cy',
  'xh',
  'yo',
  'zu'
])

class InstallError extends Error {
  constructor(code, details) {
    super(code)
    this.code = code
    this.details = details
  }
}

const sevenZip = () => require('7zip-bin').path7za.replace('app.asar', 'app.asar.unpacked')
const validZip = file => {
  try {
    return new AdmZip(file).getEntries().length > 0
  } catch {
    return false
  }
}
const remove = target => fs.rmSync(target, { recursive: true, force: true })
const exists = target => fs.existsSync(target)

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 16 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  })
}

async function isRunning(exe) {
  try {
    const name = path.basename(exe)
    const out = await run('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'])
    return out.toLowerCase().includes(name.toLowerCase())
  } catch {
    return false
  }
}

function canWrite(dir) {
  const probe = path.join(dir, `.ugl-${process.pid}.tmp`)
  try {
    fs.writeFileSync(probe, '')
    fs.rmSync(probe)
    return true
  } catch {
    return false
  }
}

function needsFont(lang) {
  return !LATIN_LANGS.has(lang)
}

function fontSupported(game) {
  return !(game.backend === 'il2cpp' && parseInt(game.unityVersion, 10) >= 6000)
}

function backupDir(ctx, game) {
  const key = game.root
    .replace(/[:\\/]+/g, '_')
    .replace(/[^\w.-]/g, '')
    .slice(-80)
  return path.join(ctx.dataDir, 'backups', key)
}

async function preflight(game, options) {
  if (!game.ok) throw new InstallError('not_unity')
  if (!game.backend) throw new InstallError('unknown_backend')
  if (game.arch !== 'x64' && game.arch !== 'x86') throw new InstallError('unsupported_arch', game.arch)
  if (game.antiCheat.length && !options.ignoreAntiCheat) throw new InstallError('anti_cheat', game.antiCheat.join(', '))
  const { bepinex, il2cppFlavor } = game.install
  if (bepinex === 5 && game.backend === 'il2cpp') throw new InstallError('wrong_bepinex')
  if (bepinex === 6 && game.backend === 'il2cpp' && !il2cppFlavor) throw new InstallError('wrong_bepinex')
  if (bepinex === 6 && game.backend === 'mono') throw new InstallError('wrong_bepinex')
  if (await isRunning(game.exe)) throw new InstallError('game_running')
  if (!canWrite(game.root)) throw new InstallError('no_access')
}

async function fetchFontBundle(game, ctx, report) {
  const name = packages.fontBundleFor(game.unityVersion)
  if (!name) return null
  const target = path.join(game.root, name)
  if (exists(target)) return name

  const cached = path.join(ctx.cacheDir, 'fonts', name)
  if (!exists(cached)) {
    const archive = path.join(ctx.cacheDir, packages.FONT_ARCHIVE.name)
    await net.download(packages.FONT_ARCHIVE.url, archive, {
      signal: ctx.signal,
      onProgress: (got, total) => report('font', 'active', { got, total })
    })
    report('font', 'active', { unpacking: true })
    fs.mkdirSync(path.dirname(cached), { recursive: true })
    await run(sevenZip(), ['e', archive, name, `-o${path.dirname(cached)}`, '-y'])
    if (!exists(cached)) throw new InstallError('font_failed')
  }
  fs.copyFileSync(cached, target)
  return name
}

function endpointSettings(options) {
  const endpoint = options.endpoint || 'GoogleTranslateV2'
  const sections = {
    Service: {
      Endpoint: endpoint,
      FallbackEndpoint: endpoint.startsWith('GoogleTranslate')
        ? endpoint === 'GoogleTranslateV2'
          ? 'GoogleTranslate'
          : 'GoogleTranslateV2'
        : 'GoogleTranslateV2'
    }
  }
  if (endpoint === 'DeepLTranslateLegitimate') {
    const key = (options.keys?.deepl || '').trim()
    sections.DeepLLegitimate = { ApiKey: key, Free: key.endsWith(':fx') ? 'True' : 'False' }
  }
  if (endpoint === 'YandexTranslate') sections.Yandex = { YandexAPIKey: (options.keys?.yandex || '').trim() }
  if (endpoint === 'BaiduTranslate') {
    sections.Baidu = { BaiduAppId: (options.keys?.baiduId || '').trim(), BaiduAppSecret: (options.keys?.baiduSecret || '').trim() }
  }
  return sections
}

function writeConfig(game, options, font) {
  const root = game.root
  const sections = endpointSettings(options)
  sections.General = { Language: options.targetLang, FromLanguage: options.sourceLang }
  sections.Behaviour = {
    MaxCharactersPerTranslation: String(Math.min(Math.max(Number(options.maxChars) || 1000, 200), 2500)),
    FallbackFontTextMeshPro: font || '',
    OverrideFont: options.uguiFont || ''
  }
  sections.Texture = { EnableTextureTranslation: options.textures ? 'True' : 'False' }
  ini.update(path.join(root, 'BepInEx', 'config', 'AutoTranslatorConfig.ini'), sections)
  ini.update(path.join(root, 'BepInEx', 'config', 'BepInEx.cfg'), { 'Logging.Console': { Enabled: options.console ? 'true' : 'false' } }, true)
}

function writeManifest(game, data) {
  const file = path.join(game.root, 'BepInEx', '.ugl.json')
  const previous = game.install.manifest || {}
  fs.writeFileSync(file, JSON.stringify({ ...previous, ...data, updatedAt: new Date().toISOString() }, null, 2))
}

async function install(input, options, ctx) {
  const report = ctx.report || (() => {})
  report('check', 'active')
  const game = analyze(input, { withLanguage: false })
  await preflight(game, options)
  report('check', 'done')

  const latest = options.latest ? await packages.resolveLatest(net.fetchJson, net.fetchText) : null
  const root = game.root
  const existedBefore = LOADER_FILES.filter(f => exists(path.join(root, f)))
  const reuseLoader = game.install.bepinex && game.install.status !== 'installed' && !game.install.manifest
  const bepinex = packages.bepinex(game.backend, game.arch, latest)
  const xunity = packages.xunity(game.backend, latest)

  if (reuseLoader) {
    const off = path.join(root, 'winhttp.dll.disabled')
    if (exists(off) && !exists(path.join(root, 'winhttp.dll'))) fs.renameSync(off, path.join(root, 'winhttp.dll'))
    report('bepinex', 'skip')
  } else {
    report('bepinex', 'active')
    const zip = await net.download(bepinex.url, path.join(ctx.cacheDir, bepinex.file), {
      signal: ctx.signal,
      validate: validZip,
      onProgress: (got, total) => report('bepinex', 'active', { got, total })
    })
    remove(path.join(root, 'winhttp.dll.disabled'))
    new AdmZip(zip).extractAllTo(root, true)
    report('bepinex', 'done')
  }

  report('xunity', 'active')
  const xzip = await net.download(xunity.url, path.join(ctx.cacheDir, xunity.file), {
    signal: ctx.signal,
    validate: validZip,
    onProgress: (got, total) => report('xunity', 'active', { got, total })
  })
  new AdmZip(xzip).extractAllTo(root, true)
  report('xunity', 'done')

  const backup = path.join(backupDir(ctx, game), 'Translation')
  const translation = path.join(root, 'BepInEx', 'Translation')
  if (exists(backup) && !exists(translation)) fs.cpSync(backup, translation, { recursive: true })

  let font = null
  if (!options.fontFix) report('font', 'skip', { reason: 'off' })
  else if (!needsFont(options.targetLang)) report('font', 'skip', { reason: 'latin' })
  else if (!fontSupported(game)) report('font', 'skip', { reason: 'engine' })
  else {
    report('font', 'active')
    try {
      font = await fetchFontBundle(game, ctx, report)
      report('font', font ? 'done' : 'skip', font ? undefined : { reason: 'engine' })
    } catch (err) {
      if (ctx.signal?.aborted) throw err
      report('font', 'error', { message: err.message })
    }
  }

  report('config', 'active')
  writeConfig(game, options, font)
  writeManifest(game, {
    app: ctx.appVersion,
    installedAt: game.install.manifest?.installedAt || new Date().toISOString(),
    backend: game.backend,
    arch: game.arch,
    bepinex: reuseLoader ? 'existing' : bepinex.version,
    xunity: xunity.version,
    reusedLoader: Boolean(reuseLoader || game.install.manifest?.reusedLoader),
    created: game.install.manifest?.created || LOADER_FILES.filter(f => !existedBefore.includes(f) && exists(path.join(root, f))),
    font,
    targetLang: options.targetLang,
    sourceLang: options.sourceLang
  })
  report('config', 'done')

  if (options.pretranslate) await runPretranslate(game, options, ctx)
  else report('pretranslate', 'skip')
  return analyze(root)
}

async function runPretranslate(game, options, ctx) {
  const report = ctx.report || (() => {})
  report('pretranslate', 'active', { phase: 'scan' })
  try {
    const result = await pretranslate(
      game,
      { company: game.company, product: game.product },
      {
        from: options.sourceLang,
        to: options.targetLang,
        signal: ctx.signal,
        limit: options.pretranslateLimit || 40000,
        report: p => report('pretranslate', 'active', p)
      }
    )
    report('pretranslate', 'done', { done: result.translated, total: result.found })
    return result
  } catch (err) {
    if (ctx.signal?.aborted) throw err
    report('pretranslate', 'error', { message: err.message })
    return null
  }
}

async function updatePretranslation(input, ctx) {
  const game = analyze(input, { withLanguage: false })
  const { status, language, fromLanguage } = game.install
  if (status !== 'installed' || !language || !fromLanguage) return null
  return runPretranslate(game, { sourceLang: fromLanguage, targetLang: language }, ctx)
}

async function pretranslateGame(input, options, ctx) {
  const game = analyze(input, { withLanguage: false })
  if (game.install.status !== 'installed' && game.install.status !== 'disabled') throw new InstallError('not_installed')
  await runPretranslate(game, options, ctx)
  return analyze(game.root)
}

async function applySettings(input, options, ctx) {
  const game = analyze(input, { withLanguage: false })
  if (game.install.status !== 'installed' && game.install.status !== 'disabled') throw new InstallError('not_installed')
  if (await isRunning(game.exe)) throw new InstallError('game_running')
  let font = game.install.manifest?.font || null
  if (options.fontFix && needsFont(options.targetLang) && fontSupported(game)) {
    font = await fetchFontBundle(game, ctx, ctx.report || (() => {})).catch(() => font)
  } else {
    font = null
  }
  writeConfig(game, options, font)
  writeManifest(game, { font, targetLang: options.targetLang, sourceLang: options.sourceLang })
  return analyze(game.root)
}

async function uninstall(input, { keepTranslations = true } = {}, ctx) {
  const game = analyze(input, { withLanguage: false })
  if (!game.ok) throw new InstallError('not_unity')
  if (await isRunning(game.exe)) throw new InstallError('game_running')
  const root = game.root
  const manifest = game.install.manifest

  const translation = path.join(root, 'BepInEx', 'Translation')
  if (keepTranslations && exists(translation)) {
    const backup = path.join(backupDir(ctx, game), 'Translation')
    remove(backup)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.cpSync(translation, backup, { recursive: true })
  }

  if (manifest?.font) remove(path.join(root, manifest.font))
  if (manifest?.reusedLoader) {
    for (const p of XUNITY_PATHS) remove(path.join(root, p))
    remove(translation)
    remove(path.join(root, 'BepInEx', '.ugl.json'))
  } else {
    for (const f of manifest?.created?.length ? manifest.created : LOADER_FILES) remove(path.join(root, f))
    remove(path.join(root, 'winhttp.dll.disabled'))
  }
  return analyze(root)
}

async function setEnabled(input, enabled) {
  const game = analyze(input, { withLanguage: false })
  if (!game.ok) throw new InstallError('not_unity')
  if (await isRunning(game.exe)) throw new InstallError('game_running')
  const root = game.root
  const loader = exists(path.join(root, 'version.dll')) || exists(path.join(root, 'version.dll.disabled')) ? 'version.dll' : 'winhttp.dll'
  const on = path.join(root, loader)
  const off = `${on}.disabled`
  if (enabled && exists(off)) {
    remove(on)
    fs.renameSync(off, on)
  }
  if (!enabled && exists(on)) {
    remove(off)
    fs.renameSync(on, off)
  }
  return analyze(root)
}

module.exports = { install, applySettings, pretranslateGame, updatePretranslation, uninstall, setEnabled, isRunning, canWrite, InstallError, needsFont }
