export type Backend = 'il2cpp' | 'mono'
export type InstallStatus = 'none' | 'installed' | 'disabled' | 'broken' | 'foreign'
export type StepId = 'check' | 'bepinex' | 'xunity' | 'font' | 'config' | 'pretranslate'
export type LaunchStage = 'starting' | 'loader' | 'libraries' | 'cpp2il' | 'interop' | 'plugins' | 'ready' | 'error' | 'timeout'
export type Accent = 'red' | 'violet' | 'blue' | 'green' | 'orange' | 'pink'
export type StepState = 'wait' | 'active' | 'done' | 'skip' | 'error'

export interface Manifest {
  installedAt?: string
  bepinex?: string
  xunity?: string
  font?: string | null
  targetLang?: string
  sourceLang?: string
  reusedLoader?: boolean
}

export interface InstallInfo {
  status: InstallStatus
  bepinex: 5 | 6 | null
  il2cppFlavor: boolean
  xunity: boolean
  melon: boolean
  manifest: Manifest | null
  language: string | null
  fromLanguage: string | null
  endpoint: string | null
  font: string | null
  translations: number
  lastRun: { at: number; loaded: boolean; errors: number } | null
}

export interface Game {
  ok: true
  root: string
  exe: string
  dataDir: string
  folder: string
  name: string
  company: string | null
  product: string | null
  backend: Backend | null
  arch: 'x64' | 'x86' | 'arm64' | null
  unityVersion: string | null
  antiCheat: string[]
  steamAppId: string | null
  sourceLanguage: string | null
  install: InstallInfo
  icon?: string
  shortcut?: boolean
  running?: boolean
}

export type ProcessState = 'launching' | 'running'

export interface Failure {
  ok: false
  error: string
  details?: string
}

export type GameResult = Game | Failure

export interface Keys {
  deepl: string
  yandex: string
  baiduId: string
  baiduSecret: string
}

export type UiLang = 'ru' | 'en' | 'uk'

export interface Settings {
  uiLang: UiLang | 'system'
  targetLang: string
  sourceLang: string
  endpoint: string
  keys: Keys
  fontFix: boolean
  uguiFont: string
  textures: boolean
  console: boolean
  latest: boolean
  maxChars: number
  keepTranslations: boolean
  sidebar: boolean
  pretranslate: boolean
  askShortcut: boolean
  accent: Accent
  transparency: boolean
  minimizeOnLaunch: boolean
  watchLaunch: boolean
}

export interface RecentGame {
  root: string
  name: string
  backend: Backend | null
  arch: string | null
  unityVersion: string | null
  status: InstallStatus | 'anticheat'
  language: string | null
  seenAt: number
}

export interface Progress {
  step: StepId
  state: StepState
  got?: number
  total?: number
  unpacking?: boolean
  message?: string
  phase?: 'scan' | 'translate'
  done?: number
  reason?: 'off' | 'latin' | 'engine'
}

export interface SystemCheck {
  github: boolean
  google: boolean
  free: number | null
  writable: boolean
}

export interface Entry {
  key: string
  value: string
  file: string
}

export interface InstallOptions {
  targetLang: string
  sourceLang: string
  endpoint: string
  keys: Keys
  fontFix: boolean
  uguiFont: string
  textures: boolean
  console: boolean
  latest: boolean
  maxChars: number
  pretranslate: boolean
  ignoreAntiCheat?: boolean
}

interface Bridge {
  material: 'acrylic' | 'solid'
  settings: { get(): Promise<Settings>; save(next: Partial<Settings>): Promise<Settings> }
  recent: { get(): Promise<RecentGame[]>; remove(root: string): Promise<RecentGame[]> }
  game: {
    analyze(input: string): Promise<GameResult>
    pick(): Promise<string | null>
    install(input: string, options: InstallOptions): Promise<GameResult>
    pretranslate(input: string, options: InstallOptions): Promise<GameResult>
    shortcut(input: string): Promise<{ ok: boolean; path?: string; error?: string }>
    onStage(cb: (e: { root: string; stage: LaunchStage }) => void): () => void
    onProcess(cb: (e: { root: string; state: ProcessState | 'stopped' }) => void): () => void
    apply(input: string, options: InstallOptions): Promise<GameResult>
    uninstall(input: string, options: { keepTranslations: boolean }): Promise<GameResult>
    toggle(input: string, enabled: boolean): Promise<GameResult>
    launch(input: string): Promise<{ ok: boolean; error?: string }>
    open(target: string): Promise<string>
    log(root: string): Promise<string | null>
  }
  library: { scan(): Promise<{ count: number; recent: RecentGame[] }>; onFound(cb: (root: string) => void): () => void }
  system: { check(root: string): Promise<SystemCheck> }
  translations: {
    load(root: string, lang: string): Promise<Entry[]>
    save(root: string, lang: string, edits: { key: string; value: string }[]): Promise<number>
    folder(root: string, lang: string): Promise<string>
    exportPack(root: string, name: string): Promise<string | null>
    importPack(root: string): Promise<number | null>
  }
  task: { cancel(): Promise<boolean>; onProgress(cb: (p: Progress) => void): () => void }
  cache: { size(): Promise<number>; clear(): Promise<boolean> }
  app: {
    info(): Promise<{ version: string; material: string; acrylicSupported: boolean; systemLanguage: string; platform: string }>
    openUrl(url: string): Promise<void>
  }
  window: {
    minimize(): void
    maximize(): void
    close(): void
    onState(cb: (s: { maximized: boolean }) => void): () => void
  }
  pathForFile(file: File): string
}

declare global {
  interface Window {
    ugl: Bridge
  }
}

export const api = window.ugl
