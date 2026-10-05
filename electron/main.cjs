const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { analyze } = require('./game.cjs')
const installer = require('./installer.cjs')
const { createStore } = require('./store.cjs')
const { scanLibraries } = require('./library.cjs')
const launcher = require('./launcher.cjs')
const translations = require('./translations.cjs')

if (!app.requestSingleInstanceLock()) app.quit()

const userDir = app.getPath('userData')
const cacheDir = path.join(userDir, 'cache')
let store
let win
let busy = null
let stopWatch = null
const processes = new Map()

const windowsBuild = () => (process.platform === 'win32' ? Number(os.release().split('.')[2]) || 0 : 0)
const supportsAcrylic = () => windowsBuild() >= 22621

function createWindow() {
  const acrylic = supportsAcrylic() && store.getSettings().transparency
  win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: acrylic ? '#00000000' : '#121215',
    backgroundMaterial: acrylic ? 'acrylic' : undefined,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    title: 'Unity Game Language Changer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--ugl-material=${acrylic ? 'acrylic' : 'solid'}`]
    }
  })
  win.once('ready-to-show', () => win.show())
  win.on('maximize', () => send('window:state', { maximized: true }))
  win.on('unmaximize', () => send('window:state', { maximized: false }))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

const send = (channel, payload) => win?.webContents.send(channel, payload)
const toError = err => ({ ok: false, error: err?.code || 'unexpected', details: err?.details || err?.message || String(err) })

async function withGameIcon(game) {
  if (!game?.ok) return game
  try {
    const icon = await app.getFileIcon(game.exe, { size: 'large' })
    game.icon = icon.toDataURL()
  } catch {}
  game.shortcut = fs.existsSync(launcher.shortcutPath(game, game.install.language))
  game.running = await installer.isRunning(game.exe)
  if (game.running) trackProcess(game, true)
  return game
}

function trackProcess(game, alreadyRunning) {
  const key = game.root.toLowerCase()
  if (processes.has(key)) return
  const started = Date.now()
  let seen = alreadyRunning
  send('game:process', { root: game.root, state: seen ? 'running' : 'launching' })
  const timer = setInterval(async () => {
    const running = await installer.isRunning(game.exe)
    if (running && !seen) {
      seen = true
      send('game:process', { root: game.root, state: 'running' })
    } else if (!running && (seen || Date.now() - started > 120000)) {
      clearInterval(timer)
      processes.delete(key)
      send('game:process', { root: game.root, state: 'stopped' })
      if (seen) refreshAfterSession(game)
    }
  }, 2000)
  processes.set(key, timer)
}

function track(game) {
  if (game?.ok) store.pushRecent(game)
  return game
}

function guard(task) {
  return async (_event, ...args) => {
    if (busy) return { ok: false, error: 'busy' }
    busy = new AbortController()
    try {
      return await task(busy.signal, ...args)
    } catch (err) {
      return toError(err)
    } finally {
      busy = null
    }
  }
}

async function refreshAfterSession(game) {
  if (busy || !store.getSettings().pretranslate) return
  busy = new AbortController()
  try {
    const result = await installer.updatePretranslation(game.root, { ...context(busy.signal), report: () => {} })
    if (result?.translated) send('game:refreshed', { root: game.root, added: result.translated })
  } catch {
  } finally {
    busy = null
  }
}

function context(signal) {
  return {
    cacheDir,
    dataDir: userDir,
    appVersion: app.getVersion(),
    signal,
    report: (step, state, extra) => send('task:progress', { step, state, ...(extra || {}) })
  }
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
    return res.status < 500
  } catch {
    return false
  }
}

function systemLanguage() {
  const preferred = (app.getPreferredSystemLanguages?.()[0] || app.getLocale() || 'en').toLowerCase()
  return preferred
}

function registerHandlers() {
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:save', (_, next) => {
    const saved = store.saveSettings(next)
    if ('transparency' in next && win && supportsAcrylic()) {
      win.setBackgroundMaterial(next.transparency ? 'acrylic' : 'none')
      win.setBackgroundColor(next.transparency ? '#00000000' : '#121215')
    }
    return saved
  })
  ipcMain.handle('recent:get', () => store.getRecent())
  ipcMain.handle('recent:remove', (_, root) => store.removeRecent(root))

  ipcMain.handle('game:analyze', async (_, input) => {
    try {
      return withGameIcon(track(analyze(input)))
    } catch (err) {
      return toError(err)
    }
  })

  ipcMain.handle('game:pick', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Unity game', extensions: ['exe'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(
    'game:install',
    guard(async (signal, input, options) => withGameIcon(track(await installer.install(input, options, context(signal)))))
  )
  ipcMain.handle(
    'game:apply',
    guard(async (signal, input, options) => withGameIcon(track(await installer.applySettings(input, options, context(signal)))))
  )
  ipcMain.handle(
    'game:pretranslate',
    guard(async (signal, input, options) => withGameIcon(track(await installer.pretranslateGame(input, options, context(signal)))))
  )
  ipcMain.handle(
    'game:uninstall',
    guard(async (signal, input, options) => withGameIcon(track(await installer.uninstall(input, options, context(signal)))))
  )
  ipcMain.handle(
    'game:toggle',
    guard(async (_, input, enabled) => withGameIcon(track(await installer.setEnabled(input, enabled))))
  )

  ipcMain.handle('game:launch', async (_, input) => {
    const game = analyze(input, { withLanguage: false })
    if (!game.ok) return toError({ code: 'not_unity' })
    stopWatch?.()
    stopWatch = null
    if (game.install.status === 'installed') {
      stopWatch = launcher.watch(game, stage => send('game:stage', { root: game.root, stage }))
    }
    await launcher.launch(game)
    trackProcess(game, false)
    return { ok: true }
  })

  ipcMain.handle('game:shortcut', async (_, input) => {
    const game = analyze(input, { withLanguage: false })
    if (!game.ok) return toError({ code: 'not_unity' })
    try {
      return { ok: true, path: launcher.createShortcut(game, game.install.language) }
    } catch (err) {
      return toError(err)
    }
  })

  ipcMain.handle('game:open', (_, target) => shell.openPath(target))

  ipcMain.handle('game:log', (_, root) => {
    const file = path.join(root, 'BepInEx', 'LogOutput.log')
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-400).join('\n')
  })

  ipcMain.handle('games:scan', async () => {
    const found = await scanLibraries(root => send('games:found', root))
    for (const root of found) {
      try {
        track(analyze(root, { withLanguage: false }))
      } catch {}
    }
    return { count: found.length, recent: store.getRecent() }
  })

  ipcMain.handle('system:check', async (_, root) => {
    const [github, google] = await Promise.all([reachable('https://github.com'), reachable('https://translate.googleapis.com')])
    let free = null
    try {
      const stat = fs.statfsSync(root)
      free = stat.bavail * stat.bsize
    } catch {}
    return { github, google, free, writable: installer.canWrite(root) }
  })

  ipcMain.handle('translations:load', (_, root, lang) => translations.load(root, lang))
  ipcMain.handle('translations:save', (_, root, lang, edits) => translations.save(root, lang, edits))
  ipcMain.handle('translations:folder', (_, root, lang) => {
    const dir = path.join(root, 'BepInEx', 'Translation', lang, 'Text')
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })

  ipcMain.handle('pack:export', async (_, root, name) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), `${name.replace(/[<>:"/\\|?*]/g, '')} translation.zip`),
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return null
    return translations.exportPack(root, result.filePath)
  })

  ipcMain.handle('pack:import', async (_, root) => {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Zip', extensions: ['zip'] }] })
    if (result.canceled) return null
    return translations.importPack(root, result.filePaths[0])
  })

  ipcMain.handle('task:cancel', () => {
    busy?.abort()
    return true
  })

  ipcMain.handle('cache:size', () => {
    let total = 0
    const walk = dir => {
      for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else total += fs.statSync(full).size
      }
    }
    walk(cacheDir)
    return total
  })

  ipcMain.handle('cache:clear', () => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
    return true
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    material: supportsAcrylic() ? 'acrylic' : 'solid',
    acrylicSupported: supportsAcrylic(),
    systemLanguage: systemLanguage(),
    platform: process.platform
  }))

  ipcMain.handle('app:open-url', (_, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
  })

  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('window:close', () => win?.close())
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  store = createStore(userDir, systemLanguage())
  registerHandlers()
  createWindow()
})

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('window-all-closed', () => app.quit())
