import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Failure, Game, GameResult, InstallOptions, LaunchStage, ProcessState, RecentGame, Settings, StepId, SystemCheck } from './api'
import { I18n, Key, makeT, resolveUiLang } from './i18n'
import { supports } from './translators'
import { TitleBar } from './components/TitleBar'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { EmptyState } from './components/EmptyState'
import { GamePanel, MenuAction, StepView } from './components/GamePanel'
import { SettingsView } from './components/SettingsView'
import { TranslationEditor } from './components/TranslationEditor'
import { Dialog } from './components/Dialog'
import { Toast, Toasts } from './components/Toasts'
import { DropZone } from './components/DropZone'

type Steps = Partial<Record<StepId, StepView>>

const installSteps = (): Steps => ({
  check: { state: 'wait' },
  bepinex: { state: 'wait' },
  xunity: { state: 'wait' },
  font: { state: 'wait' },
  config: { state: 'wait' },
  pretranslate: { state: 'wait' }
})

const KNOWN_ERRORS = [
  'not_unity',
  'unknown_backend',
  'unsupported_arch',
  'anti_cheat',
  'wrong_bepinex',
  'game_running',
  'no_access',
  'font_failed',
  'not_installed',
  'busy'
]

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState({ version: '', systemLanguage: 'en', acrylicSupported: false })
  const [recent, setRecent] = useState<RecentGame[]>([])
  const [view, setView] = useState<'translate' | 'settings'>('translate')
  const [game, setGame] = useState<Game | null>(null)
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ title: string; text: string } | null>(null)
  const [steps, setSteps] = useState<Steps | null>(null)
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<SystemCheck | null>(null)
  const [stages, setStages] = useState<Record<string, LaunchStage>>({})
  const [processes, setProcesses] = useState<Record<string, ProcessState>>({})
  const [scanning, setScanning] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirm, setConfirm] = useState<'remove' | 'anticheat' | null>(null)
  const [shortcutFor, setShortcutFor] = useState<Game | null>(null)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [editor, setEditor] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [sources, setSources] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)
  const stepsTimer = useRef<number>(0)
  const openRequest = useRef(0)
  const gameRef = useRef<Game | null>(null)
  gameRef.current = game

  const lang = resolveUiLang(settings?.uiLang ?? 'system', info.systemLanguage)
  const t = useMemo(() => makeT(lang), [lang])

  const dismiss = useCallback((id: number) => {
    setToasts(list => list.map(x => (x.id === id ? { ...x, leaving: true } : x)))
    window.setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 200)
  }, [])

  const toast = useCallback(
    (kind: Toast['kind'], title: string, text?: string) => {
      const id = Date.now() + Math.random()
      setToasts(list => [...list.slice(-3), { id, kind, title, text }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500)
    },
    [dismiss]
  )

  const describe = useCallback(
    (failure: Failure) => {
      const code = KNOWN_ERRORS.includes(failure.error) ? failure.error : 'unexpected'
      const text = t(`error.${code}.text` as Key)
      return {
        title: t(`error.${code}` as Key),
        text:
          code === 'unexpected' && failure.details
            ? `${text} (${failure.details})`
            : code === 'anti_cheat' && failure.details
              ? `${failure.details}. ${text}`
              : text
      }
    },
    [t]
  )

  const open = useCallback(
    async (input: string) => {
      if (!input) return
      const request = ++openRequest.current
      setView('translate')
      setLoading(true)
      setError(null)
      setSteps(null)
      setChecks(null)
      setPath(input)
      const result = await api.game.analyze(input)
      if (request !== openRequest.current) return
      if (result.ok) {
        setGame(result)
        setPath(result.root)
      } else {
        setGame(null)
        setError(describe(result))
      }
      setRecent(await api.recent.get())
      setLoading(false)
    },
    [describe]
  )

  const refresh = useCallback(async () => {
    const current = gameRef.current
    if (!current) return
    const result = await api.game.analyze(current.root)
    if (result.ok) setGame(result)
    setRecent(await api.recent.get())
  }, [])

  useEffect(() => {
    Promise.all([api.settings.get(), api.recent.get(), api.app.info()]).then(([s, r, i]) => {
      setSettings(s)
      setRecent(r)
      setInfo({ version: i.version, systemLanguage: i.systemLanguage, acrylicSupported: i.acrylicSupported })
      if (r[0]) open(r[0].root)
    })
  }, [])

  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    root.dataset.accent = settings.accent
    root.dataset.material = settings.transparency && info.acrylicSupported ? 'acrylic' : 'solid'
    root.lang = lang
  }, [settings?.accent, settings?.transparency, info.acrylicSupported, lang])

  useEffect(
    () =>
      api.task.onProgress(p =>
        setSteps(current =>
          current
            ? { ...current, [p.step]: { state: p.state, got: p.got, total: p.total, unpacking: p.unpacking, phase: p.phase, done: p.done, reason: p.reason } }
            : current
        )
      ),
    []
  )

  useEffect(
    () =>
      api.game.onStage(({ root, stage }) => {
        setStages(current => ({ ...current, [root]: stage }))
        if (stage === 'ready' || stage === 'error' || stage === 'timeout') {
          refresh()
          if (stage === 'ready') {
            window.setTimeout(
              () =>
                setStages(current => {
                  const next = { ...current }
                  delete next[root]
                  return next
                }),
              12000
            )
          }
        }
      }),
    [refresh]
  )

  useEffect(
    () =>
      api.game.onProcess(({ root, state }) => {
        setProcesses(current => {
          const next = { ...current }
          if (state === 'stopped') delete next[root]
          else next[root] = state
          return next
        })
        if (state === 'stopped') refresh()
      }),
    [refresh]
  )

  useEffect(
    () =>
      api.game.onRefreshed(({ added }) => {
        toast('ok', t('toast.refreshed'), t('toast.refreshed.text', { n: added.toLocaleString(lang) }))
        refresh()
      }),
    [refresh, toast, t, lang]
  )

  useEffect(() => {
    if (!game || game.install.status === 'installed' || game.install.status === 'disabled') return
    let alive = true
    setChecks(null)
    api.system.check(game.root).then(result => alive && setChecks(result))
    return () => {
      alive = false
    }
  }, [game?.root, game?.install.status])

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => e.preventDefault()
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) open(api.pathForFile(file))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [open])

  if (!settings) return <div className="app boot" />

  const update = (next: Partial<Settings>) => {
    setSettings({ ...settings, ...next })
    api.settings.save(next).then(setSettings)
  }

  const sourceFor = (g: Game) =>
    sources[g.root] ||
    (settings.sourceLang !== 'auto' ? settings.sourceLang : null) ||
    (g.install.status !== 'none' ? g.install.fromLanguage : null) ||
    g.sourceLanguage ||
    'en'

  const optionsFor = (g: Game, extra: Partial<InstallOptions> = {}): InstallOptions => {
    const sourceLang = sourceFor(g)
    return {
      targetLang: settings.targetLang,
      sourceLang,
      endpoint: supports(settings.endpoint, settings.targetLang, sourceLang) ? settings.endpoint : 'GoogleTranslateV2',
      keys: settings.keys,
      fontFix: settings.fontFix,
      uguiFont: settings.uguiFont,
      textures: settings.textures,
      console: settings.console,
      latest: settings.latest,
      maxChars: settings.maxChars,
      pretranslate: settings.pretranslate,
      ...extra
    }
  }

  const finish = async (result: GameResult, success: (game: Game) => void) => {
    setBusy(false)
    if (result.ok) {
      setGame(result)
      success(result)
    } else {
      const { title, text } = describe(result)
      toast('error', title, text)
      setSteps(s => (s ? (Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v?.state === 'active' ? { state: 'error' } : v])) as Steps) : s))
    }
    setRecent(await api.recent.get())
  }

  const hideStepsLater = () => {
    window.clearTimeout(stepsTimer.current)
    stepsTimer.current = window.setTimeout(() => setSteps(null), 6000)
  }

  const runInstall = async (ignoreAntiCheat = false) => {
    if (!game) return
    window.clearTimeout(stepsTimer.current)
    setBusy(true)
    setSteps(installSteps())
    const result = await api.game.install(game.root, optionsFor(game, { ignoreAntiCheat }))
    await finish(result, installed => {
      toast('ok', t('toast.installed'), t(installed.backend === 'il2cpp' ? 'toast.installed.text' : 'toast.installed.mono'))
      hideStepsLater()
    })
  }

  const runPretranslate = async () => {
    if (!game) return
    window.clearTimeout(stepsTimer.current)
    setBusy(true)
    setSteps({ pretranslate: { state: 'active', phase: 'scan' } })
    const result = await api.game.pretranslate(game.root, optionsFor(game))
    await finish(result, translated => {
      toast('ok', t('toast.pretranslated'), t('toast.pretranslated.text', { n: translated.install.translations.toLocaleString(lang) }))
      hideStepsLater()
    })
  }

  const runApply = async () => {
    if (!game) return
    setBusy(true)
    const result = await api.game.apply(game.root, optionsFor(game))
    await finish(result, () => toast('ok', t('toast.applied')))
  }

  const runToggle = async (enabled: boolean) => {
    if (!game) return
    setBusy(true)
    const result = await api.game.toggle(game.root, enabled)
    await finish(result, () => toast('ok', t(enabled ? 'toast.enabled' : 'toast.disabled')))
  }

  const runRemove = async () => {
    if (!game) return
    setConfirm(null)
    setBusy(true)
    const result = await api.game.uninstall(game.root, { keepTranslations: settings.keepTranslations })
    await finish(result, () => toast('ok', t('toast.removed')))
  }

  const startGame = async (target: Game) => {
    const result = await api.game.launch(target.root)
    if (!result.ok) {
      toast('error', t('error.unexpected'))
      return
    }
    setProcesses(current => ({ ...current, [target.root]: current[target.root] ?? 'launching' }))
    if (settings.watchLaunch && target.install.status === 'installed') setStages(current => ({ ...current, [target.root]: 'starting' }))
    if (settings.minimizeOnLaunch) api.window.minimize()
  }

  const launch = () => {
    if (!game) return
    if (settings.askShortcut && game.install.status === 'installed' && !game.shortcut) {
      setShortcutFor(game)
      setShortcutOpen(true)
      return
    }
    startGame(game)
  }

  const answerShortcut = async (answer: 'yes' | 'no' | 'never') => {
    const target = shortcutFor
    setShortcutOpen(false)
    if (!target) return
    if (answer === 'never') update({ askShortcut: false })
    if (answer === 'yes') {
      const result = await api.game.shortcut(target.root)
      if (result.ok) toast('ok', t('toast.shortcut'))
      await refresh()
    }
    startGame(target)
  }

  const menu = async (action: MenuAction) => {
    if (!game) return
    const translationLang = game.install.language || settings.targetLang
    if (action === 'editor') setEditor(true)
    if (action === 'folder') api.translations.folder(game.root, translationLang)
    if (action === 'log') {
      setLog(await api.game.log(game.root))
      setLogOpen(true)
    }
    if (action === 'export') {
      const saved = await api.translations.exportPack(game.root, game.name)
      if (saved) toast('ok', t('toast.exported'), saved)
    }
    if (action === 'import') {
      const count = await api.translations.importPack(game.root)
      if (count !== null) {
        toast('ok', t('toast.imported'), t('toast.imported.text', { n: count }))
        refresh()
      }
    }
    if (action === 'shortcut') {
      const result = await api.game.shortcut(game.root)
      if (result.ok) {
        toast('ok', t('toast.shortcut'), result.path)
        refresh()
      } else toast('error', t('error.unexpected'), result.error)
    }
  }

  const scan = async () => {
    setScanning(true)
    const result = await api.library.scan()
    setRecent(result.recent)
    setScanning(false)
    toast('ok', t('toast.scanned', { n: result.count }))
    if (!settings.sidebar) update({ sidebar: true })
  }

  const browse = async () => {
    const picked = await api.game.pick()
    if (picked) open(picked)
  }

  return (
    <I18n.Provider value={{ t, lang }}>
      <div className="app">
        <TitleBar version={info.version} />
        <main className="shell">
          <TopBar
            path={path}
            view={view}
            language={settings.targetLang}
            sidebar={settings.sidebar}
            onSubmitPath={open}
            onBrowse={browse}
            onView={setView}
            onLanguage={targetLang => update({ targetLang })}
            onToggleSidebar={() => update({ sidebar: !settings.sidebar })}
          />
          {view === 'translate' ? (
            <div key="translate" className={settings.sidebar ? 'content with-sidebar' : 'content'}>
              <Sidebar
                open={settings.sidebar}
                games={recent}
                active={game?.root ?? null}
                scanning={scanning}
                onScan={scan}
                onSelect={open}
                onRemove={async root => {
                  setRecent(await api.recent.remove(root))
                  if (game?.root === root) {
                    setGame(null)
                    setPath('')
                  }
                }}
              />
              {game && !loading ? (
                <GamePanel
                  game={game}
                  settings={settings}
                  source={sourceFor(game)}
                  steps={steps}
                  busy={busy}
                  checks={checks}
                  stage={stages[game.root] ?? null}
                  process={processes[game.root] ?? (game.running ? 'running' : null)}
                  onSource={code => setSources({ ...sources, [game.root]: code })}
                  onEndpoint={endpoint => update({ endpoint })}
                  onInstall={runInstall}
                  onApply={runApply}
                  onPretranslate={runPretranslate}
                  onToggle={runToggle}
                  onRemove={() => setConfirm('remove')}
                  onLaunch={launch}
                  onCancel={() => api.task.cancel()}
                  onMenu={menu}
                  onIgnoreAntiCheat={() => setConfirm('anticheat')}
                />
              ) : (
                <section className="panel">
                  <EmptyState loading={loading} error={error} scanning={scanning} onBrowse={browse} onScan={scan} />
                </section>
              )}
            </div>
          ) : (
            <SettingsView settings={settings} version={info.version} acrylic={info.acrylicSupported} onChange={update} onToast={title => toast('ok', title)} />
          )}
        </main>

        <DropZone visible={dragging} label={t('dropHere')} />

        <Dialog
          open={confirm === 'remove'}
          title={t('confirm.remove')}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className="button" onClick={() => setConfirm(null)}>
                {t('confirm.cancel')}
              </button>
              <button type="button" className="button primary" onClick={runRemove}>
                {t('confirm.remove.ok')}
              </button>
            </>
          }
        >
          <p>{t('confirm.remove.text')}</p>
        </Dialog>

        <Dialog
          open={confirm === 'anticheat'}
          title={t('confirm.anticheat')}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className="button" onClick={() => setConfirm(null)}>
                {t('confirm.cancel')}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setConfirm(null)
                  runInstall(true)
                }}
              >
                {t('confirm.anticheat.ok')}
              </button>
            </>
          }
        >
          <p>{t('confirm.anticheat.text')}</p>
        </Dialog>

        {shortcutFor && (
          <Dialog
            open={shortcutOpen}
            title={t('shortcut.title')}
            onClose={() => setShortcutOpen(false)}
            actions={
              <>
                <button type="button" className="button ghost" onClick={() => answerShortcut('never')}>
                  {t('shortcut.never')}
                </button>
                <button type="button" className="button" onClick={() => answerShortcut('no')}>
                  {t('shortcut.no')}
                </button>
                <button type="button" className="button primary" onClick={() => answerShortcut('yes')}>
                  {t('shortcut.yes')}
                </button>
              </>
            }
          >
            <div className="shortcut-preview">
              {shortcutFor.icon && <img src={shortcutFor.icon} alt="" />}
              <p>{t('shortcut.text', { name: `${shortcutFor.name} (${(shortcutFor.install.language || settings.targetLang).toUpperCase()})` })}</p>
            </div>
          </Dialog>
        )}

        {game && (
          <TranslationEditor
            open={editor}
            root={game.root}
            lang={game.install.language || settings.targetLang}
            onClose={() => setEditor(false)}
            onSaved={() => {
              setEditor(false)
              toast('ok', t('toast.editorSaved'), t('toast.editorSaved.text'))
              refresh()
            }}
          />
        )}

        <Dialog
          open={logOpen}
          wide
          title={t('logTitle')}
          onClose={() => setLogOpen(false)}
          actions={
            <button type="button" className="button" onClick={() => setLogOpen(false)}>
              {t('close')}
            </button>
          }
        >
          {log ? <pre className="log">{log}</pre> : <p className="muted">{t('logEmpty')}</p>}
        </Dialog>

        <Toasts items={toasts} onDismiss={dismiss} />
      </div>
    </I18n.Provider>
  )
}
