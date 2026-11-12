export function singleHunkPatch(diff: string, index: number): string | null {
  const parsed = splitUnifiedDiff(diff)
  if (!parsed) return null
  const hunk = parsed.hunks[index]
  if (!hunk) return null
  const body = hunk.body.length > 0 ? `\n${hunk.body}` : ''
  return `${parsed.preamble}\n${hunk.header}${body}\n`
}

function splitUnifiedDiff(diff: string): { preamble: string; hunks: { header: string; body: string }[] } | null {
  const normalized = diff.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  const lines = trimmed.split('\n')
  const start = lines.findIndex((line) => line.startsWith('@@ '))
  if (start <= 0 || !lines[0]?.startsWith('diff --git ')) return null
  const hunks: { header: string; body: string }[] = []
  let header = ''
  let body: string[] = []
  const push = () => {
    if (!header) return
    hunks.push({ header, body: body.join('\n') })
  }
  for (const line of lines.slice(start)) {
    if (line.startsWith('@@ ')) {
      push()
      header = line
      body = []
      continue
    }
    if (line.startsWith('diff --git ')) break
    body.push(line)
  }
  push()
  if (hunks.length === 0) return null
  return { preamble: lines.slice(0, start).join('\n'), hunks }
}
