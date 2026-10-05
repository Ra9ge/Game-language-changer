import { useEffect, useState } from 'react'

export function usePresence(open: boolean, duration = 170) {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, duration)
    return () => window.clearTimeout(timer)
  }, [open])

  return { mounted, leaving }
}
