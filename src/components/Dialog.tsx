import { ReactNode, useEffect } from 'react'
import { usePresence } from './usePresence'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  actions: ReactNode
  onClose: () => void
  wide?: boolean
}

export function Dialog({ open, title, children, actions, onClose, wide }: Props) {
  const { mounted, leaving } = usePresence(open, 180)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className={leaving ? 'overlay closing' : 'overlay'} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
