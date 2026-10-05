import { useLayoutEffect, useRef, useState } from 'react'

interface Item<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({ items, value, onChange }: { items: Item<T>[]; value: T; onChange: (value: T) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const active = refs.current[value]
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth })
  }, [value, items.map(i => i.label).join()])

  return (
    <div className="segmented">
      <span className="segmented-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />
      {items.map(item => (
        <button
          type="button"
          key={item.value}
          ref={el => {
            refs.current[item.value] = el
          }}
          className={item.value === value ? 'on' : ''}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
