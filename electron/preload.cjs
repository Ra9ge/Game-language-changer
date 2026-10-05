const { contextBridge, ipcRenderer, webUtils } = require('electron')

const material = (process.argv.find(a => a.startsWith('--ugl-material=')) || '').split('=')[1] || 'solid'

const subscribe = (channel, callback) => {
  const listener = (_, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('ugl', {
  material,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: next => ipcRenderer.invoke('settings:save', next)
  },
  recent: {
    get: () => ipcRenderer.invoke('recent:get'),
    remove: root => ipcRenderer.invoke('recent:remove', root)
  },
  game: {
    analyze: input => ipcRenderer.invoke('game:analyze', input),
    pick: () => ipcRenderer.invoke('game:pick'),
    install: (input, options) => ipcRenderer.invoke('game:install', input, options),
    pretranslate: (input, options) => ipcRenderer.invoke('game:pretranslate', input, options),
    shortcut: input => ipcRenderer.invoke('game:shortcut', input),
    onStage: callback => subscribe('game:stage', callback),
    onProcess: callback => subscribe('game:process', callback),
    onRefreshed: callback => subscribe('game:refreshed', callback),
    apply: (input, options) => ipcRenderer.invoke('game:apply', input, options),
    uninstall: (input, options) => ipcRenderer.invoke('game:uninstall', input, options),
    toggle: (input, enabled) => ipcRenderer.invoke('game:toggle', input, enabled),
    launch: input => ipcRenderer.invoke('game:launch', input),
    open: target => ipcRenderer.invoke('game:open', target),
    log: root => ipcRenderer.invoke('game:log', root)
  },
  library: {
    scan: () => ipcRenderer.invoke('games:scan'),
    onFound: callback => subscribe('games:found', callback)
  },
  system: {
    check: root => ipcRenderer.invoke('system:check', root)
  },
  translations: {
    load: (root, lang) => ipcRenderer.invoke('translations:load', root, lang),
    save: (root, lang, edits) => ipcRenderer.invoke('translations:save', root, lang, edits),
    folder: (root, lang) => ipcRenderer.invoke('translations:folder', root, lang),
    exportPack: (root, name) => ipcRenderer.invoke('pack:export', root, name),
    importPack: root => ipcRenderer.invoke('pack:import', root)
  },
  task: {
    cancel: () => ipcRenderer.invoke('task:cancel'),
    onProgress: callback => subscribe('task:progress', callback)
  },
  cache: {
    size: () => ipcRenderer.invoke('cache:size'),
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openUrl: url => ipcRenderer.invoke('app:open-url', url)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onState: callback => subscribe('window:state', callback)
  },
  pathForFile: file => webUtils.getPathForFile(file)
})
