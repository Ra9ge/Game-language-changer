const fs = require('fs')
const path = require('path')

const field = (text, key) => {
  const match = text.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'))
  return match ? match[1] : null
}

function findApp(root) {
  const parts = path.resolve(root).split(path.sep)
  const index = parts.map(p => p.toLowerCase()).lastIndexOf('common')
  if (index < 1 || parts[index - 1].toLowerCase() !== 'steamapps' || index + 1 >= parts.length) return null

  const steamapps = parts.slice(0, index).join(path.sep)
  const installDir = parts[index + 1].toLowerCase()
  let manifests = []
  try {
    manifests = fs.readdirSync(steamapps).filter(f => /^appmanifest_\d+\.acf$/i.test(f))
  } catch {
    return null
  }
  for (const file of manifests) {
    try {
      const text = fs.readFileSync(path.join(steamapps, file), 'utf8')
      if ((field(text, 'installdir') || '').toLowerCase() === installDir) {
        return { appId: field(text, 'appid'), name: field(text, 'name') }
      }
    } catch {}
  }
  return null
}

module.exports = { findApp }
