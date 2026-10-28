export function formatWhen(epochSeconds: number): string {
  if (!epochSeconds) return ''
  const then = epochSeconds * 1000
  const delta = Date.now() - then
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return 'just now'
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`
  if (delta < day) return `${Math.floor(delta / hour)}h ago`
  if (delta < 14 * day) return `${Math.floor(delta / day)}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(then))
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

export function baseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Conflict',
  T: 'Type changed',
  '?': 'Untracked',
}

export function statusLabel(code: string): string {
  const letter = code[0] || '?'
  return STATUS_LABELS[letter] ?? letter
}

export function statusClass(code: string): string {
  const letter = code[0] || '?'
  return letter === '?' ? 'q' : letter
}
