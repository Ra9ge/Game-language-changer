const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { locate } = require('./game.cjs')

const query = (key, value) =>
  new Promise(resolve => {
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const match = out.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`))
      resolve(match ? match[1].trim() : null)
    })
  })

async function steamLibraries() {
  const roots = new Set()
  const steam = (await query('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || (await query('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'))
  if (steam) {
    const base = path.normalize(steam)
    roots.add(path.join(base, 'steamapps', 'common'))
    try {
      const vdf = fs.readFileSync(path.join(base, 'steamapps', 'libraryfolders.vdf'), 'utf8')
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps', 'common'))
    } catch {}
  }
  return [...roots]
}

function otherLibraries() {
  const drives = 'CDEFGH'
    .split('')
    .map(d => `${d}:\\`)
    .filter(d => fs.existsSync(d))
  const list = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Epic Games'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'GOG Galaxy', 'Games'),
    path.join(process.env.APPDATA || '', 'itch', 'apps')
  ]
  for (const d of drives)
    list.push(path.join(d, 'Games'), path.join(d, 'GOG Games'), path.join(d, 'Epic Games'), path.join(d, 'SteamLibrary', 'steamapps', 'common'))
  return list
}

async function scanLibraries(onFound) {
  const roots = [...new Set([...(await steamLibraries()), ...otherLibraries()])].filter(r => fs.existsSync(r))
  const games = []
  const seen = new Set()
  for (const root of roots) {
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())
    } catch {
      continue
    }
    for (const e of entries) {
      const found = locate(path.join(root, e.name))
      if (!found || seen.has(found.root.toLowerCase())) continue
      seen.add(found.root.toLowerCase())
      games.push(found.root)
      onFound?.(found.root)
      await new Promise(r => setImmediate(r))
    }
  }
  return games
}

module.exports = { scanLibraries }
