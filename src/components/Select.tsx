import { ReactNode, useMemo, useState } from 'react'
import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react'
import { usePopover } from './usePopover'

export interface Option {
  value: string
  label: string
  hint?: string
  icon?: ReactNode
  search?: string
}

interface Props {
  value: string
  options: Option[]
  onChange: (value: string) => void
  searchable?: boolean
  searchPlaceholder?: string
  align?: 'left' | 'right'
  variant?: 'field' | 'chip'
  prefix?: ReactNode
  label?: ReactNode
  disabled?: boolean
}

export function Select({ value, options, onChange, searchable, searchPlaceholder, align = 'left', variant = 'field', prefix, label, disabled }: Props) {
  const { open, setOpen, ref, mounted, closing } = usePopover()
  const [query, setQuery] = useState('')
  const current = options.find(o => o.value === value)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => `${o.label} ${o.hint || ''} ${o.search || ''} ${o.value}`.toLowerCase().includes(q))
  }, [options, query])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`select ${variant}${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="select-button" disabled={disabled} onClick={() => setOpen(!open)}>
        {prefix}
        {current?.icon}
        <span className="select-label">{label ?? current?.label}</span>
        <IconChevronDown size={14} className="select-chevron" />
      </button>
      {mounted && (
        <div className={`menu ${align}${closing ? ' closing' : ''}`}>
          {searchable && (
            <div className="menu-search">
              <IconSearch size={15} />
              <input
                autoFocus
                value={query}
                placeholder={searchPlaceholder}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && visible[0]) pick(visible[0].value)
                }}
              />
            </div>
          )}
          <div className="menu-list">
            {visible.map(o => (
              <button type="button" key={o.value} className={o.value === value ? 'menu-item active' : 'menu-item'} onClick={() => pick(o.value)}>
                {o.icon}
                <span className="menu-text">{o.label}</span>
                {o.hint && <span className="menu-hint">{o.hint}</span>}
                {o.value === value && <IconCheck size={15} className="menu-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
