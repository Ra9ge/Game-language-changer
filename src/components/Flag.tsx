import { IconWorld } from '@tabler/icons-react'
import { findLanguage } from '../languages'

export function Flag({ code }: { code?: string | null }) {
  const country = findLanguage(code)?.flag
  if (!country) {
    return (
      <span className="flag flag-empty">
        <IconWorld size={11} stroke={2} />
      </span>
    )
  }
  return <span className={`flag fi fi-${country}`} />
}
