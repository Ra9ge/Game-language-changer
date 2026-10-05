import { useEffect, useState } from 'react'
import { IconCopy, IconMinus, IconSquare, IconX } from '@tabler/icons-react'
import { api } from '../api'
import { useI18n } from '../i18n'

export function TitleBar({ version }: { version: string }) {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => api.window.onState(s => setMaximized(s.maximized)), [])

  return (
    <header className="titlebar" onDoubleClick={() => api.window.maximize()}>
      <div className="notch">
        <b>Unity Game Language Changer</b>
        {version && <span> · v{version}</span>}
      </div>
      <div className="window-buttons">
        <button type="button" aria-label={t('minimize')} onClick={() => api.window.minimize()}>
          <IconMinus size={15} />
        </button>
        <button type="button" aria-label={t('maximize')} onClick={() => api.window.maximize()}>
          {maximized ? <IconCopy size={13} /> : <IconSquare size={13} />}
        </button>
        <button type="button" className="close" aria-label={t('close')} onClick={() => api.window.close()}>
          <IconX size={16} />
        </button>
      </div>
    </header>
  )
}
