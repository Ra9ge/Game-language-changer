import { IconLoader2, IconRadar, IconX } from '@tabler/icons-react'
import { RecentGame } from '../api'
import { Key, useI18n } from '../i18n'

interface Props {
  open: boolean
  games: RecentGame[]
  active: string | null
  scanning: boolean
  onSelect: (root: string) => void
  onRemove: (root: string) => void
  onScan: () => void
}

const shortPath = (root: string) => {
  const parts = root.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? [parts[0], '…', parts[parts.length - 2]].join('\\') : parts.slice(0, -1).join('\\')
}

const statusTone = (status: RecentGame['status']) =>
  status === 'installed' ? 'good' : status === 'anticheat' || status === 'broken' ? 'bad' : status === 'disabled' ? 'warn' : 'muted'

export function Sidebar({ open, games, active, scanning, onSelect, onRemove, onScan }: Props) {
  const { t } = useI18n()
  const names = new Map<string, number>()
  for (const g of games) names.set(g.name, (names.get(g.name) || 0) + 1)

  return (
    <aside className={open ? 'sidebar' : 'sidebar collapsed'} aria-hidden={!open}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <div className="caption">{t('recent')}</div>
          <button type="button" className="scan-button" disabled={scanning} onClick={onScan} title={t('scanGames')}>
            {scanning ? <IconLoader2 size={14} className="spin" /> : <IconRadar size={14} />}
            {scanning ? t('scanning') : t('scanGames')}
          </button>
        </div>
        {!games.length && <div className="sidebar-empty">{t('recentEmpty')}</div>}
        <div className="recent-list">
          {games.map(game => (
            <div
              key={game.root}
              role="button"
              tabIndex={0}
              className={active?.toLowerCase() === game.root.toLowerCase() ? 'recent active' : 'recent'}
              onClick={() => onSelect(game.root)}
              onKeyDown={e => e.key === 'Enter' && onSelect(game.root)}
            >
              <div className="recent-title">
                {game.backend && (
                  <span className={game.backend === 'il2cpp' ? 'badge accent-badge' : 'badge'}>{game.backend === 'il2cpp' ? 'IL2CPP' : 'Mono'}</span>
                )}
                <span className="recent-name">{game.name}</span>
              </div>
              <div className="recent-meta">
                {[
                  game.unityVersion && `Unity ${game.unityVersion.split('.').slice(0, 2).join('.')}`,
                  game.arch,
                  (names.get(game.name) || 0) > 1 && shortPath(game.root)
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className={`recent-status ${statusTone(game.status)}`}>
                {t(`status.${game.status}` as Key)}
                {game.status === 'installed' && game.language ? ` · ${game.language.toUpperCase()}` : ''}
              </div>
              <button
                type="button"
                className="recent-remove"
                aria-label={t('removeFromList')}
                title={t('removeFromList')}
                onClick={e => {
                  e.stopPropagation()
                  onRemove(game.root)
                }}
              >
                <IconX size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
