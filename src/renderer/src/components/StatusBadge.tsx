import { statusClass, statusLabel } from '../format'

export function StatusBadge({ code }: { code: string }) {
  const letter = code[0] || '?'
  return (
    <span className={`badge b-${statusClass(letter)}`} title={statusLabel(letter)}>
      {letter}
    </span>
  )
}
