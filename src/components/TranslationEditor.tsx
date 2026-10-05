import { useEffect, useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { api, Entry } from '../api'
import { useI18n } from '../i18n'
import { Dialog } from './Dialog'

const PAGE = 150

interface Props {
  open: boolean
  root: string
  lang: string
  onClose: () => void
  onSaved: () => void
}

export function TranslationEditor({ open, root, lang, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [query, setQuery] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEntries(null)
    setEdits({})
    setQuery('')
    api.translations.load(root, lang).then(setEntries)
  }, [open, root, lang])

  const filtered = useMemo(() => {
    if (!entries) return []
    const q = query.trim().toLowerCase()
    const list = q ? entries.filter(e => e.key.toLowerCase().includes(q) || (edits[e.key] ?? e.value).toLowerCase().includes(q)) : entries
    return list.slice(0, PAGE)
  }, [entries, query, edits])

  const changed = Object.keys(edits).length

  const save = async () => {
    setSaving(true)
    await api.translations.save(
      root,
      lang,
      Object.entries(edits).map(([key, value]) => ({ key, value }))
    )
    setSaving(false)
    onSaved()
  }

  return (
    <Dialog
      open={open}
      wide
      title={t('editor.title')}
      onClose={onClose}
      actions={
        <>
          <span className="dialog-note">
            {entries && t('editor.count', { n: entries.length.toLocaleString() })}
            {entries && entries.length > PAGE && ` · ${t('editor.shown', { n: PAGE })}`}
            {changed > 0 && ` · ${t('editor.changed', { n: changed })}`}
          </span>
          <button type="button" className="button" onClick={onClose}>
            {t('confirm.cancel')}
          </button>
          <button type="button" className="button primary" disabled={!changed || saving} onClick={save}>
            {t('editor.save')}
          </button>
        </>
      }
    >
      <div className="search editor-search">
        <IconSearch size={16} />
        <input autoFocus value={query} placeholder={t('editor.search')} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="editor-list">
        {entries === null && <div className="spinner centered" />}
        {entries?.length === 0 && <p className="muted">{t('editor.empty')}</p>}
        {filtered.map(entry => (
          <div className={edits[entry.key] !== undefined ? 'editor-row edited' : 'editor-row'} key={entry.key}>
            <div className="editor-original" title={entry.file}>
              {entry.key}
            </div>
            <textarea
              spellCheck={false}
              rows={Math.min(4, Math.max(1, Math.ceil(entry.key.length / 60), (edits[entry.key] ?? entry.value).split('\n').length))}
              value={edits[entry.key] ?? entry.value}
              onChange={e => {
                const value = e.target.value
                setEdits(current => {
                  const next = { ...current }
                  if (value === entry.value) delete next[entry.key]
                  else next[entry.key] = value
                  return next
                })
              }}
            />
          </div>
        ))}
      </div>
    </Dialog>
  )
}
