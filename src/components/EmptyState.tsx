import { IconAlertTriangle, IconFolderOpen, IconLoader2, IconRadar } from '@tabler/icons-react'
import { useI18n } from '../i18n'
import logo from '../assets/logo.png'

interface Props {
  loading: boolean
  scanning: boolean
  error: { title: string; text: string } | null
  onBrowse: () => void
  onScan: () => void
}

export function EmptyState({ loading, scanning, error, onBrowse, onScan }: Props) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="empty">
        <div className="spinner" />
        <p className="muted">{t('analyzing')}</p>
      </div>
    )
  }

  return (
    <div className="empty">
      <img className="empty-logo" src={logo} alt="" draggable={false} />
      {error ? (
        <div className="card bad compact">
          <div className="card-title">
            <IconAlertTriangle size={17} />
            {error.title}
          </div>
          <p>{error.text}</p>
        </div>
      ) : (
        <>
          <h1>{t('emptyTitle')}</h1>
          <p className="muted">{t('emptyText')}</p>
        </>
      )}
      <div className="empty-actions">
        <button type="button" className="button primary" onClick={onBrowse}>
          <IconFolderOpen size={18} />
          {t('emptyButton')}
        </button>
        <button type="button" className="button" disabled={scanning} onClick={onScan}>
          {scanning ? <IconLoader2 size={18} className="spin" /> : <IconRadar size={18} />}
          {scanning ? t('scanning') : t('emptyScan')}
        </button>
      </div>
      <p className="hint">{t('emptyHint')}</p>
    </div>
  )
}
