import { IconFolderOpen } from '@tabler/icons-react'
import { usePresence } from './usePresence'

export function DropZone({ visible, label }: { visible: boolean; label: string }) {
  const { mounted, leaving } = usePresence(visible, 160)
  if (!mounted) return null
  return (
    <div className={leaving ? 'drop-zone closing' : 'drop-zone'}>
      <IconFolderOpen size={42} stroke={1.5} />
      <span>{label}</span>
    </div>
  )
}
