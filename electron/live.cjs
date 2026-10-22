// Live translator: while a game launched from the app is running, XUnity sends lines that
// were not translated ahead to this local server (XUnity "CustomTranslate" endpoint).
// Spam checks that make XUnity shut itself down when lines change fast are turned off for it,
// failed requests are retried here, and XUnity falls back to its own Google endpoint if the
// app is not reachable. The game config goes back to normal when the game closes.
const fs = require('fs')
const path = require('path')
const http = require('http')
const ini = require('./ini.cjs')
const { translateText } = require('./pretranslate.cjs')

const FREE = /^GoogleTranslate(V2)?$/
const cache = new Map()
const active = new Set()
let server = null
let port = 0

const configFile = root => path.join(root, 'BepInEx', 'config', 'AutoTranslatorConfig.ini')
const stateFile = root => path.join(root, 'BepInEx', '.ugl-live.json')

function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(root), 'utf8'))
  } catch {
    return null
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname !== '/translate') {
    res.writeHead(404)
    res.end()
    return
  }
  const from = url.searchParams.get('from') || 'auto'
  const to = url.searchParams.get('to') || 'en'
  const text = url.searchParams.get('text') || ''
  const key = `${from}\u0000${to}\u0000${text}`
  try {
    let value = cache.get(key)
    if (value == null) {
      value = text.trim() ? await translateText(text, from, to, AbortSignal.timeout(15000)) : text
      if (cache.size > 50000) cache.clear()
      cache.set(key, value)
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(value)
  } catch {
    res.writeHead(503)
    res.end()
  }
}

async function ensureServer(preferred = 0) {
  if (server) return port
  const created = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      try {
        res.writeHead(500)
        res.end()
      } catch {}
    })
  })
  const listen = wanted =>
    new Promise((resolve, reject) => {
      created.once('error', reject)
      created.listen(wanted, '127.0.0.1', () => {
        created.removeListener('error', reject)
        resolve()
      })
    })
  try {
    await listen(preferred)
  } catch (err) {
    if (!preferred) throw err
    await listen(0)
  }
  server = created
  port = server.address().port
  return port
}

function stopServer() {
  if (!server || active.size) return
  server.close()
  server = null
  port = 0
}

// Switches the game to the live translator. Only for the free Google endpoints:
// translators with the user's own keys are left alone.
async function enable(game) {
  const root = game.root
  const file = configFile(root)
  if (!fs.existsSync(file)) return false
  const text = ini.read(file)
  let saved = readState(root)
  if (saved && ini.get(text, 'Service', 'Endpoint') !== 'CustomTranslate') {
    // left over from a session that did not end cleanly, and the config was rewritten since
    fs.rmSync(stateFile(root), { force: true })
    saved = null
  }
  const endpoint = saved?.endpoint || ini.get(text, 'Service', 'Endpoint') || 'GoogleTranslateV2'
  const fallback = saved ? saved.fallback : ini.get(text, 'Service', 'FallbackEndpoint') || ''
  if (!FREE.test(endpoint)) return false

  const livePort = await ensureServer()
  fs.writeFileSync(stateFile(root), JSON.stringify({ endpoint, fallback, port: livePort }, null, 2))
  ini.update(file, {
    Service: { Endpoint: 'CustomTranslate', FallbackEndpoint: endpoint },
    Custom: { Url: `http://127.0.0.1:${livePort}/translate`, EnableShortDelay: 'True', DisableSpamChecks: 'True' }
  })
  active.add(root.toLowerCase())
  return true
}

// Puts the translator the user picked back into the game config.
function restore(root) {
  active.delete(String(root).toLowerCase())
  const saved = readState(root)
  if (saved) {
    try {
      const file = configFile(root)
      if (fs.existsSync(file) && ini.get(ini.read(file), 'Service', 'Endpoint') === 'CustomTranslate') {
        ini.update(file, { Service: { Endpoint: saved.endpoint || 'GoogleTranslateV2', FallbackEndpoint: saved.fallback || '' } })
      }
    } catch {}
    fs.rmSync(stateFile(root), { force: true })
  }
  stopServer()
}

// The app was restarted while the game kept running: serve it again on the port it already uses.
async function resume(root) {
  const saved = readState(root)
  if (!saved?.port) return false
  const got = await ensureServer(saved.port)
  if (got !== saved.port) return false
  active.add(String(root).toLowerCase())
  return true
}

function restoreAll() {
  for (const root of [...active]) restore(root)
}

const isActive = () => active.size > 0

module.exports = { enable, restore, restoreAll, resume, readState, isActive }
