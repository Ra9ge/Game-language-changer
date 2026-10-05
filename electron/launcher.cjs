const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { shell, app } = require('electron')

const safeName = s =>
  s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 80) || 'Game'

function shortcutPath(game, lang) {
  const suffix = lang ? ` (${lang.toUpperCase()})` : ''
  const ext = game.steamAppId ? 'url' : 'lnk'
  return path.join(app.getPath('desktop'), `${safeName(game.name)}${suffix}.${ext}`)
}

function createShortcut(game, lang) {
  const target = shortcutPath(game, lang)
  if (game.steamAppId) {
    const body = ['[InternetShortcut]', `URL=steam://rungameid/${game.steamAppId}`, `IconFile=${game.exe}`, 'IconIndex=0', ''].join('\r\n')
    fs.writeFileSync(target, body, 'utf8')
  } else {
    shell.writeShortcutLink(target, 'create', { target: game.exe, cwd: game.root, icon: game.exe, iconIndex: 0, description: game.name })
  }
  return target
}

async function launch(game) {
  if (game.steamAppId) await shell.openExternal(`steam://rungameid/${game.steamAppId}`)
  else spawn(game.exe, [], { cwd: game.root, detached: true, stdio: 'ignore' }).unref()
}

const STAGES = [
  { id: 'ready', test: /Loaded XUnity\.AutoTranslator|Chainloader startup complete/ },
  { id: 'plugins', test: /Chainloader (started|initialized|ready)/ },
  { id: 'interop', test: /Generating interop assemblies|Il2CppInteropGen/ },
  { id: 'cpp2il', test: /Running Cpp2IL|\[Cpp2IL\]/ },
  { id: 'libraries', test: /Downloading unity base libraries|Extracting unity base libraries/ },
  { id: 'loader', test: /BepInEx \d/ }
]

function watch(game, onStage) {
  const log = path.join(game.root, 'BepInEx', 'LogOutput.log')
  const started = Date.now()
  let last = null
  let timer = null
  const stop = () => clearInterval(timer)
  const tick = () => {
    let stage = 'starting'
    try {
      const stat = fs.statSync(log)
      if (stat.mtimeMs >= started - 2000) {
        const text = fs.readFileSync(log, 'utf8')
        if (/\[(Fatal|Error)\s*:\s*BepInEx\]|Failed to (load|run) chainloader/i.test(text) && !/Loaded XUnity/.test(text)) stage = 'error'
        else stage = STAGES.find(s => s.test.test(text))?.id || 'loader'
      }
    } catch {}
    if (stage !== last) {
      last = stage
      onStage(stage)
    }
    if (stage === 'ready' || stage === 'error' || Date.now() - started > 8 * 60 * 1000) {
      if (stage !== 'ready' && stage !== 'error') onStage('timeout')
      stop()
    }
  }
  timer = setInterval(tick, 1000)
  tick()
  return stop
}

module.exports = { createShortcut, shortcutPath, launch, watch }
