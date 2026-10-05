import { IconX } from '@tabler/icons-react'

export interface Toast {
  id: number
  kind: 'ok' | 'error'
  title: string
  text?: string
  leaving?: boolean
}

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts">
      {items.map(item => (
        <div key={item.id} className={`toast ${item.kind}${item.leaving ? ' closing' : ''}`}>
          <div className="toast-body">
            <strong>{item.title}</strong>
            {item.text && <span>{item.text}</span>}
          </div>
          <button type="button" className="toast-close" aria-label="close" onClick={() => onDismiss(item.id)}>
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
