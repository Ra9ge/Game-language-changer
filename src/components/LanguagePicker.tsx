import { useMemo, useState } from 'react'
import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react'
import { LANGUAGES, POPULAR, findLanguage, localName, matches } from '../languages'
import { useI18n } from '../i18n'
import { Flag } from './Flag'
import { usePopover } from './usePopover'

export function LanguagePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { t, lang } = useI18n()
  const { open, setOpen, ref, mounted, closing } = usePopover()
  const [query, setQuery] = useState('')

  const popular = useMemo(() => POPULAR.map(c => findLanguage(c)!).filter(Boolean), [])
  const rest = useMemo(
    () => LANGUAGES.filter(l => !POPULAR.includes(l.code)).sort((a, b) => localName(a.code, lang).localeCompare(localName(b.code, lang), lang)),
    [lang]
  )
  const found = useMemo(() => (query ? LANGUAGES.filter(l => matches(l, query, lang)) : []), [query, lang])

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  const row = (code: string, wide = false) => (
    <button type="button" key={code} className={code === value ? 'lang active' : 'lang'} onClick={() => pick(code)}>
      <Flag code={code} />
      <span className="lang-name">{findLanguage(code)?.native}</span>
      {wide && <span className="lang-local">{localName(code, lang)}</span>}
      {code === value && <IconCheck size={15} className="lang-check" />}
    </button>
  )

  return (
    <div className="language-picker" ref={ref}>
      <button type="button" className={open ? 'pill open' : 'pill'} onClick={() => setOpen(!open)}>
        <Flag code={value} />
        <span>{findLanguage(value)?.native ?? value}</span>
        <IconChevronDown size={14} />
      </button>
      {mounted && (
        <div className={closing ? 'picker closing' : 'picker'}>
          <div className="search">
            <IconSearch size={16} />
            <input
              autoFocus
              value={query}
              placeholder={t('searchLanguage')}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && found[0]) pick(found[0].code)
              }}
            />
          </div>
          <div className="picker-scroll">
            {query ? (
              found.length ? (
                found.map(l => row(l.code, true))
              ) : (
                <div className="picker-empty">{t('nothingFound')}</div>
              )
            ) : (
              <>
                <div className="picker-label">{t('popular')}</div>
                {popular.slice(0, 4).map(l => row(l.code, true))}
                <div className="picker-label">
                  {t('allLanguages')} · {LANGUAGES.length}
                </div>
                <div className="picker-grid">{[...popular.slice(4), ...rest].map(l => row(l.code))}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
