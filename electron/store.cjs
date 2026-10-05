const fs = require('fs')
const path = require('path')

const defaults = locale => {
  const lang = String(locale || 'en').toLowerCase()
  const slavic = ['ru', 'uk', 'be', 'kk'].find(l => lang.startsWith(l))
  return {
    uiLang: 'system',
    targetLang: slavic || lang.split('-')[0] || 'en',
    sourceLang: 'auto',
    endpoint: 'GoogleTranslateV2',
    keys: { deepl: '', yandex: '', baiduId: '', baiduSecret: '' },
    fontFix: true,
    uguiFont: '',
    textures: false,
    console: false,
    latest: false,
    maxChars: 1000,
    keepTranslations: true,
    sidebar: true,
    pretranslate: true,
    askShortcut: true,
    accent: 'red',
    transparency: true,
    minimizeOnLaunch: false,
    watchLaunch: true
  }
}

function createStore(dir, locale) {
  const settingsFile = path.join(dir, 'settings.json')
  const recentFile = path.join(dir, 'recent.json')
  const load = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return fallback
    }
  }
  const save = (file, data) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  }

  return {
    getSettings() {
      const base = defaults(locale)
      const saved = load(settingsFile, {})
      return { ...base, ...saved, keys: { ...base.keys, ...(saved.keys || {}) } }
    },
    saveSettings(next) {
      const merged = { ...this.getSettings(), ...next }
      save(settingsFile, merged)
      return merged
    },
    getRecent() {
      return load(recentFile, [])
    },
    pushRecent(game) {
      const entry = {
        root: game.root,
        name: game.name,
        backend: game.backend,
        arch: game.arch,
        unityVersion: game.unityVersion,
        status: game.antiCheat?.length ? 'anticheat' : game.install?.status || 'none',
        language: game.install?.language || null,
        seenAt: Date.now()
      }
      const list = [entry, ...this.getRecent().filter(g => g.root.toLowerCase() !== game.root.toLowerCase())].slice(0, 100)
      save(recentFile, list)
      return list
    },
    removeRecent(root) {
      const list = this.getRecent().filter(g => g.root.toLowerCase() !== String(root).toLowerCase())
      save(recentFile, list)
      return list
    }
  }
}

module.exports = { createStore }
