import { ReactNode, useMemo } from 'react'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconBrandSteam,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconDots,
  IconDownload,
  IconEdit,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconInfoCircle,
  IconLink,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
  IconRocket,
  IconShieldCheck,
  IconShieldX,
  IconTrash,
  IconUpload,
  IconWifiOff,
  IconWorld
} from '@tabler/icons-react'
import { Game, LaunchStage, ProcessState, Settings, StepId, StepState, SystemCheck } from '../api'
import { Key, useI18n } from '../i18n'
import { LANGUAGES, findLanguage, fontWorks, localName, needsFont } from '../languages'
import { TRANSLATORS, findTranslator, supports } from '../translators'
import { VERSIONS } from '../versions'
import { Flag } from './Flag'
import { Select } from './Select'
import { usePopover } from './usePopover'

export interface StepView {
  state: StepState
  got?: number
  total?: number
  unpacking?: boolean
  phase?: 'scan' | 'translate'
  done?: number
  reason?: 'off' | 'latin' | 'engine'
}

export type MenuAction = 'editor' | 'folder' | 'export' | 'import' | 'shortcut' | 'log'

interface Props {
  game: Game
  settings: Settings
  source: string
  steps: Partial<Record<StepId, StepView>> | null
  busy: boolean
  checks: SystemCheck | null
  stage: LaunchStage | null
  process: ProcessState | null
  onSource: (code: string) => void
  onEndpoint: (id: string) => void
  onInstall: (ignoreAntiCheat?: boolean) => void
  onApply: () => void
  onPretranslate: () => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
  onLaunch: () => void
  onCancel: () => void
  onMenu: (action: MenuAction) => void
  onIgnoreAntiCheat: () => void
}

const STEP_ORDER: StepId[] = ['check', 'bepinex', 'xunity', 'font', 'config', 'pretranslate']
const LOW_SPACE = 300 * 1024 * 1024

function Card({ tone, icon, title, children }: { tone: 'good' | 'bad' | 'warn' | 'info'; icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className={`card ${tone}`}>
      <div className="card-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'active') return <IconLoader2 size={16} className="spin accent" />
  if (state === 'done') return <IconCircleCheck size={16} className="good" />
  if (state === 'error') return <IconCircleX size={16} className="bad" />
  return <IconCircleDashed size={16} className="muted" />
}

const formatBytes = (n: number, lang: string) => {
  const gb = n / 1024 ** 3
  const unit = lang === 'en' ? (gb >= 1 ? 'GB' : 'MB') : gb >= 1 ? 'ГБ' : 'МБ'
  return gb >= 1 ? `${gb.toFixed(1)} ${unit}` : `${Math.round(n / 1024 ** 2)} ${unit}`
}

function MoreMenu({ onMenu, hasShortcut }: { onMenu: (a: MenuAction) => void; hasShortcut?: boolean }) {
  const { t } = useI18n()
  const { open, setOpen, ref, mounted, closing } = usePopover()
  const items: { id: MenuAction; icon: ReactNode; label: Key }[] = [
    { id: 'editor', icon: <IconEdit size={16} />, label: 'menu.editor' },
    { id: 'folder', icon: <IconFolder size={16} />, label: 'menu.folder' },
    { id: 'export', icon: <IconDownload size={16} />, label: 'menu.export' },
    { id: 'import', icon: <IconUpload size={16} />, label: 'menu.import' },
    { id: 'shortcut', icon: <IconLink size={16} />, label: 'menu.shortcut' },
    { id: 'log', icon: <IconFileText size={16} />, label: 'menu.log' }
  ]
  return (
    <div className="select" ref={ref}>
      <button type="button" className="button square" aria-label={t('more')} title={t('more')} onClick={() => setOpen(!open)}>
        <IconDots size={17} />
      </button>
      {mounted && (
        <div className={`menu right up${closing ? ' closing' : ''}`}>
          {items.map(item => (
            <button
              type="button"
              key={item.id}
              className="menu-item"
              onClick={() => {
                setOpen(false)
                onMenu(item.id)
              }}
            >
              {item.icon}
              <span className="menu-text">{t(item.label)}</span>
              {item.id === 'shortcut' && hasShortcut && <IconCircleCheck size={15} className="good" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function GamePanel(props: Props) {
  const { game, settings, source, steps, checks, stage, process } = props
  const busy = props.busy || process !== null
  const { t, lang } = useI18n()
  const target = settings.targetLang
  const install = game.install
  const installed = install.status === 'installed' || install.status === 'disabled'
  const translatorOk = supports(settings.endpoint, target, source)
  const endpoint = translatorOk ? settings.endpoint : 'GoogleTranslateV2'
  const changed = installed && (install.language !== target || install.fromLanguage !== source || install.endpoint !== endpoint)
  const blocked = game.antiCheat.length > 0
  const font = settings.fontFix && needsFont(target) && fontWorks(game.backend, game.unityVersion)
  const flavor = game.backend === 'il2cpp' ? `6 · IL2CPP ${game.arch}` : `5 · Mono ${game.arch}`
  const offline = checks && !checks.github
  const lowSpace = checks?.free != null && checks.free < LOW_SPACE

  const sourceOptions = useMemo(
    () =>
      LANGUAGES.map(l => ({
        value: l.code,
        label: localName(l.code, lang),
        hint: l.native,
        search: l.native,
        icon: <Flag code={l.code} />
      })),
    [lang]
  )

  const translatorOptions = TRANSLATORS.map(tr => ({
    value: tr.id,
    label: tr.name,
    hint: tr.keys.length ? t('settings.translator.key') : undefined
  }))

  const statusCard = () => {
    if (blocked) {
      return (
        <Card tone="bad" icon={<IconShieldX size={18} />} title={t('card.anticheat', { list: game.antiCheat.join(', ') })}>
          <p>{t('card.anticheat.text')}</p>
          <button type="button" className="link-button" onClick={props.onIgnoreAntiCheat}>
            {t('card.anticheat.ignore')}
          </button>
        </Card>
      )
    }
    if (install.status === 'broken') {
      return (
        <Card tone="bad" icon={<IconAlertTriangle size={18} />} title={t('card.broken')}>
          <p>{t('card.broken.text')}</p>
        </Card>
      )
    }
    if (install.status === 'disabled') {
      return (
        <Card tone="warn" icon={<IconPower size={18} />} title={t('card.disabled')}>
          <p>{t('card.disabled.text')}</p>
        </Card>
      )
    }
    if (install.status === 'installed') {
      const run = install.lastRun
      const text = !run ? t('card.installed.waiting') : run.loaded ? t('card.installed.loaded') : t('card.installed.failed')
      return (
        <Card
          tone={run && !run.loaded ? 'warn' : 'good'}
          icon={<IconCircleCheck size={18} />}
          title={`${t('card.installed')} · ${localName(install.language || target, lang)}`}
        >
          <p>{text}</p>
        </Card>
      )
    }
    if (install.status === 'foreign') {
      return (
        <Card tone="info" icon={<IconShieldCheck size={18} />} title={t('card.foreign')}>
          <p>{t('card.foreign.text')}</p>
        </Card>
      )
    }
    return (
      <Card tone="good" icon={<IconShieldCheck size={18} />} title={t('card.ok')}>
        <p>{t('card.ok.text')}</p>
      </Card>
    )
  }

  const launchCard = () => {
    if (!stage) return null
    const done = stage === 'ready'
    const failed = stage === 'error' || stage === 'timeout'
    return (
      <div className={`launch ${done ? 'good' : failed ? 'bad' : ''}`}>
        {done ? <IconCircleCheck size={18} /> : failed ? <IconAlertTriangle size={18} /> : <IconLoader2 size={18} className="spin" />}
        <div className="launch-body">
          <div className="launch-title">{t('launchTitle')}</div>
          <div className="launch-text">{t(`stage.${stage}` as Key)}</div>
        </div>
        {failed && (
          <button type="button" className="button small" onClick={() => props.onMenu('log')}>
            <IconFileText size={15} />
            {t('showLog')}
          </button>
        )}
      </div>
    )
  }

  const progressRow = (id: StepId) => {
    const step = steps![id]!
    let note = ''
    let pct = 0
    if (step.state === 'active' && id === 'pretranslate') {
      if (step.phase === 'translate' && step.total) {
        note = t('step.translate', { done: (step.done || 0).toLocaleString(lang), total: step.total.toLocaleString(lang) })
        pct = ((step.done || 0) / step.total) * 100
      } else if (step.total) {
        note = t('step.scan', { done: step.done || 0, total: step.total })
        pct = ((step.done || 0) / step.total) * 100
      }
    } else if (step.state === 'active' && step.unpacking) note = t('step.unpacking')
    else if (step.state === 'active' && step.total) {
      pct = ((step.got || 0) / step.total) * 100
      note = t('step.downloading', { pct: Math.floor(pct) })
    } else if (step.state === 'skip') note = step.reason ? t(`step.font.${step.reason}` as Key) : t('step.skip')
    else if (step.state === 'done')
      note = id === 'pretranslate' && step.done != null ? t('toast.pretranslated.text', { n: step.done.toLocaleString(lang) }) : t('step.done')
    else if (step.state === 'error') note = t('step.error')
    return (
      <div className="row" key={id}>
        <StepIcon state={step.state} />
        <span>{t(`step.${id}` as Key)}</span>
        <span className="row-note">{note}</span>
        {pct > 0 && (
          <div className="bar">
            <div style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
      </div>
    )
  }

  const checkRow = (label: Key, value: string | null, ok: boolean | null) => (
    <div className="row" key={label}>
      {ok === null ? (
        <IconLoader2 size={16} className="spin muted" />
      ) : ok ? (
        <IconCircleCheck size={16} className="good" />
      ) : (
        <IconCircleX size={16} className="bad" />
      )}
      <span>{t(label)}</span>
      <span className="row-note">{value ?? t('check.wait')}</span>
    </div>
  )

  const checkRows = (
    <>
      {checkRow('check.internet', checks ? t(checks.github ? 'check.yes' : 'check.no') : null, checks ? checks.github : null)}
      {endpoint.startsWith('Google') &&
        checkRow('check.google', checks ? t(checks.google ? 'check.yes' : 'check.blocked') : null, checks ? checks.google : null)}
      {checkRow('check.disk', checks?.free != null ? formatBytes(checks.free, lang) : checks ? '—' : null, checks ? !lowSpace : null)}
      {checkRow('check.access', checks ? t(checks.writable ? 'check.yes' : 'check.no') : null, checks ? checks.writable : null)}
    </>
  )

  const planRow = (icon: ReactNode, label: string, note: string) => (
    <div className="row" key={label}>
      {icon}
      <span>{label}</span>
      <span className="row-note">{note}</span>
    </div>
  )

  const ok = <IconCircleCheck size={16} className="good" />
  const plan = (
    <>
      {planRow(
        ok,
        t('plan.bepinex', { flavor }),
        install.bepinex && !installed
          ? t('plan.reuse')
          : settings.latest
            ? t('plan.latest')
            : game.backend === 'il2cpp'
              ? VERSIONS.bepinexBe
              : VERSIONS.bepinex5
      )}
      {planRow(ok, t('plan.xunity'), settings.latest ? t('plan.latest') : VERSIONS.xunity)}
      {font && planRow(ok, t('plan.font'), t('plan.fontAuto'))}
      {settings.pretranslate && planRow(<IconBolt size={16} className="accent" />, t('plan.pretranslate'), t('plan.pretranslateNote'))}
      {planRow(
        <IconCircleDashed size={16} className="muted" />,
        t('plan.firstRun'),
        game.backend === 'il2cpp' ? t('plan.firstRunTime') : t('plan.firstRunFast')
      )}
    </>
  )

  const launchButton = (primary: boolean, label: Key) => (
    <button
      type="button"
      className={`button${primary ? ' primary grow' : ''}${process ? ' is-live' : ''}`}
      disabled={props.busy || process !== null}
      onClick={props.onLaunch}
    >
      {process === 'launching' ? <IconLoader2 size={17} className="spin" /> : process === 'running' ? <span className="live-dot" /> : <IconRocket size={17} />}
      {process === 'launching' ? t('launching') : process === 'running' ? t('running') : t(label)}
    </button>
  )

  const deleteButton = (
    <button type="button" className="button danger square" disabled={busy} aria-label={t('remove')} title={t('remove')} onClick={props.onRemove}>
      <IconTrash size={17} />
    </button>
  )

  const actions = () => {
    if (busy && steps) {
      return (
        <button type="button" className="button primary grow" onClick={props.onCancel}>
          <IconPlayerStop size={17} />
          {t('cancel')}
        </button>
      )
    }
    if (install.status === 'disabled') {
      return (
        <>
          <button type="button" className="button primary grow" disabled={busy} onClick={() => props.onToggle(true)}>
            <IconPower size={17} />
            {t('enable')}
          </button>
          {launchButton(false, 'launch')}
          <MoreMenu onMenu={props.onMenu} hasShortcut={game.shortcut} />
          {deleteButton}
        </>
      )
    }
    if (install.status === 'installed') {
      return (
        <>
          {changed ? (
            <button type="button" className="button primary grow" disabled={busy} onClick={props.onApply}>
              <IconRefresh size={17} />
              {t('apply')}
            </button>
          ) : (
            launchButton(true, 'launchGame')
          )}
          <button type="button" className="button" disabled={props.busy} onClick={props.onPretranslate}>
            <IconBolt size={17} />
            {t('pretranslate')}
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => props.onToggle(false)}>
            <IconPower size={17} />
            {t('disable')}
          </button>
          <MoreMenu onMenu={props.onMenu} hasShortcut={game.shortcut} />
          {deleteButton}
        </>
      )
    }
    return (
      <>
        <button
          type="button"
          className="button primary grow"
          disabled={busy || Boolean(offline)}
          onClick={() => (blocked ? props.onIgnoreAntiCheat() : props.onInstall())}
        >
          <IconPlayerPlay size={17} />
          {t('install')}
        </button>
        {launchButton(false, 'launch')}
        {install.status === 'broken' && deleteButton}
      </>
    )
  }

  return (
    <section className="panel game" key={game.root}>
      <div className="game-head">
        {game.icon ? <img className="game-icon" src={game.icon} alt="" /> : <div className="game-icon placeholder" />}
        <div className="game-head-text">
          <div className="badges">
            {game.backend && (
              <span className={game.backend === 'il2cpp' ? 'badge accent-badge' : 'badge'}>{game.backend === 'il2cpp' ? 'IL2CPP' : 'Mono'}</span>
            )}
            <span className="meta">{[game.unityVersion && `Unity ${game.unityVersion}`, game.arch, game.company].filter(Boolean).join(' · ')}</span>
            {game.steamAppId && (
              <span className="meta steam">
                <IconBrandSteam size={13} />
                {game.steamAppId}
              </span>
            )}
          </div>
          <h1 title={game.name}>{game.name}</h1>
        </div>
        <button type="button" className="button ghost" onClick={() => window.ugl.game.open(game.root)}>
          <IconFolderOpen size={16} />
          {t('openFolder')}
        </button>
      </div>

      <div className="chips">
        <Select
          variant="chip"
          value={source}
          options={sourceOptions}
          searchable
          searchPlaceholder={t('searchLanguage')}
          onChange={props.onSource}
          disabled={busy}
          label={
            <>
              {t('gameLanguage')}: {localName(source, lang).toLocaleLowerCase(lang)}
              {source === game.sourceLanguage && settings.sourceLang === 'auto' && <em>{t('autoShort')}</em>}
            </>
          }
        />
        <span className="chip plain">
          <IconArrowRight size={15} />
          <Flag code={target} />
          {findLanguage(target)?.native}
        </span>
        <Select
          variant="chip"
          value={settings.endpoint}
          options={translatorOptions}
          onChange={props.onEndpoint}
          disabled={busy}
          prefix={<IconWorld size={15} />}
          label={findTranslator(settings.endpoint).name}
        />
      </div>

      {launchCard()}
      {statusCard()}
      {!installed && offline && (
        <Card tone="bad" icon={<IconWifiOff size={18} />} title={t('card.offline')}>
          <p>{t('card.offline.text')}</p>
        </Card>
      )}
      {!installed && !offline && checks && !checks.google && endpoint.startsWith('Google') && (
        <Card tone="warn" icon={<IconAlertTriangle size={18} />} title={t('card.googleBlocked')}>
          <p>{t('card.googleBlocked.text')}</p>
        </Card>
      )}
      {!installed && lowSpace && (
        <Card tone="warn" icon={<IconAlertTriangle size={18} />} title={t('card.space')}>
          <p>{t('card.space.text')}</p>
        </Card>
      )}
      {!installed && !steps && font && (
        <Card tone="info" icon={<IconInfoCircle size={18} />} title={t('card.font', { lang: localName(target, lang) })}>
          <p>{t('card.font.text')}</p>
        </Card>
      )}
      {!translatorOk && (
        <Card tone="warn" icon={<IconAlertTriangle size={18} />} title={t('card.translator', { name: findTranslator(settings.endpoint).name })}>
          <p>{t('card.translator.text')}</p>
        </Card>
      )}
      {install.melon && (
        <Card tone="warn" icon={<IconAlertTriangle size={18} />} title={t('card.melon')}>
          <p>{t('card.melon.text')}</p>
        </Card>
      )}

      {steps ? (
        <>
          <div className="caption">{t('planTitle')}</div>
          <div className="rows">
            {STEP_ORDER.filter(id => steps[id] && (id !== 'pretranslate' || steps[id]!.state !== 'wait' || settings.pretranslate)).map(progressRow)}
          </div>
        </>
      ) : !installed ? (
        <div className="columns">
          <div>
            <div className="caption">{t('planTitle')}</div>
            <div className="rows">{plan}</div>
          </div>
          <div>
            <div className="caption">{t('checksTitle')}</div>
            <div className="rows">{checkRows}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="caption">{t('detailsTitle')}</div>
          <div className="rows details">
            {planRow(
              null,
              t('details.loader'),
              `BepInEx ${install.bepinex}${install.manifest?.bepinex && install.manifest.bepinex !== 'existing' ? ` · ${install.manifest.bepinex}` : ''}`
            )}
            {planRow(null, t('details.translator'), `${findTranslator(install.endpoint || '').name} · ${install.fromLanguage} → ${install.language}`)}
            {planRow(null, t('details.lines'), install.translations.toLocaleString(lang))}
            {planRow(null, t('details.font'), install.font || t('details.fontDefault'))}
            {planRow(
              null,
              t('details.lastRun'),
              install.lastRun ? new Date(install.lastRun.at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : t('details.never')
            )}
          </div>
        </>
      )}

      <div className="actions">{actions()}</div>
    </section>
  )
}
