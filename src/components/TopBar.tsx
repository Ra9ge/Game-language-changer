import { useEffect, useState } from 'react'
import { IconFolder, IconHistory } from '@tabler/icons-react'
import { useI18n } from '../i18n'
import { LanguagePicker } from './LanguagePicker'
import { Segmented } from './Segmented'
import logo from '../assets/logo.png'

interface Props {
  path: string
  view: 'translate' | 'settings'
  language: string
  sidebar: boolean
  onSubmitPath: (path: string) => void
  onBrowse: () => void
  onView: (view: 'translate' | 'settings') => void
  onLanguage: (code: string) => void
  onToggleSidebar: () => void
}

export function TopBar({ path, view, language, sidebar, onSubmitPath, onBrowse, onView, onLanguage, onToggleSidebar }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(path)

  useEffect(() => setDraft(path), [path])

  return (
    <div className="topbar">
      <img className="logo" src={logo} alt="" draggable={false} />
      <div className="path-field">
        <button type="button" className="path-browse" aria-label={t('browse')} onClick={onBrowse}>
          <IconFolder size={18} />
        </button>
        <input
          value={draft}
          spellCheck={false}
          placeholder={t('pathPlaceholder')}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft.trim()) onSubmitPath(draft.trim())
          }}
          onPaste={e => {
            const text = e.clipboardData.getData('text').trim()
            if (text) {
              e.preventDefault()
              setDraft(text)
              onSubmitPath(text)
            }
          }}
        />
      </div>
      <Segmented
        value={view}
        onChange={onView}
        items={[
          { value: 'translate', label: t('tabTranslate') },
          { value: 'settings', label: t('tabSettings') }
        ]}
      />
      <LanguagePicker value={language} onChange={onLanguage} />
      <button
        type="button"
        className={sidebar ? 'icon-button active' : 'icon-button'}
        aria-label={t('toggleSidebar')}
        title={t('toggleSidebar')}
        onClick={onToggleSidebar}
      >
        <IconHistory size={19} />
      </button>
    </div>
  )
}
