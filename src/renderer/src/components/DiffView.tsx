function diffClass(line: string): string {
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return 'diff-meta'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-del'
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('\\') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity') ||
    line.startsWith('rename ') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode')
  ) {
    return 'diff-meta'
  }
  return 'diff-ctx'
}

export function DiffView({ text }: { text: string }) {
  if (!text) return <div className="muted pad">No diff.</div>
  const lines = text.split(/\r?\n/)
  return (
    <div className="diff">
      {lines.map((line, index) => (
        <div key={`${index}-${line.slice(0, 12)}`} className={diffClass(line)}>
          {line || ' '}
        </div>
      ))}
    </div>
  )
}
