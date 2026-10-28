import { useEffect, useMemo } from 'react'
import type { Commit } from '@shared/types'
import { LANE_WIDTH, ROW_HEIGHT, laneColor, layoutCommits, type GraphRow } from '@shared/layout'
import { formatWhen, shortHash } from '../format'

export function CommitGraph({
  commits,
  truncated,
  query,
  selected,
  onQuery,
  onSelect,
}: {
  commits: Commit[]
  truncated: boolean
  query: string
  selected: string | null
  onQuery: (value: string) => void
  onSelect: (hash: string) => void
}) {
  const rows = useMemo(() => layoutCommits(commits), [commits])
  const maxCol = rows.reduce((max, row) => {
    let next = Math.max(max, row.col)
    for (const edge of row.edges) next = Math.max(next, edge.from, edge.to)
    for (let index = 0; index < row.input.length; index++) if (row.input[index]) next = Math.max(next, index)
    return next
  }, 0)
  const graphWidth = (maxCol + 1) * LANE_WIDTH + 12
  const needle = query.trim().toLowerCase()

  useEffect(() => {
    document.querySelector('.commit.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected, commits])

  return (
    <section className="graph-panel">
      <div className="panel-head">
        <input
          className="filter"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Filter messages, authors, hashes"
          spellCheck={false}
        />
        <span className="muted">
          {commits.length}
          {truncated ? '+' : ''} commits
        </span>
      </div>
      <div className="graph-scroll" style={{ ['--lanes' as string]: `${graphWidth}px` }}>
        {rows.length === 0 && <p className="muted pad">No commits yet. Stage files below and create the first one.</p>}
        {rows.map((row, index) => {
          const haystack = `${row.commit.subject} ${row.commit.author} ${row.commit.hash}`.toLowerCase()
          const dim = Boolean(needle) && !haystack.includes(needle)
          const isSelected = row.commit.hash === selected
          return (
            <button
              key={row.commit.hash}
              type="button"
              className={`commit${isSelected ? ' selected' : ''}${dim ? ' dim' : ''}`}
              onClick={() => onSelect(row.commit.hash)}
              aria-current={row.commit.head ? 'true' : undefined}
              aria-selected={isSelected}
            >
              <GraphCell row={row} previous={rows[index - 1]} width={graphWidth} selected={isSelected} />
              <span className="subject">
                {row.commit.refs.length > 0 && (
                  <span className="pills">
                    {row.commit.refs.map((ref) => (
                      <span key={`${ref.kind}-${ref.name}`} className={`pill ${ref.kind}${ref.current ? ' current' : ''}`}>
                        {ref.name}
                      </span>
                    ))}
                  </span>
                )}
                <span className="title" title={row.commit.subject}>
                  {row.commit.subject || 'Empty message'}
                </span>
              </span>
              <span className="short-hash mono">{shortHash(row.commit.hash)}</span>
              <span className="author" title={row.commit.author}>
                {row.commit.author}
              </span>
              <span className="when">{formatWhen(row.commit.time)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function GraphCell({
  row,
  previous,
  width,
  selected,
}: {
  row: GraphRow
  previous?: GraphRow
  width: number
  selected: boolean
}) {
  const x = (col: number) => 8 + col * LANE_WIDTH + LANE_WIDTH / 2
  const mid = ROW_HEIGHT / 2
  const continued = previous ? previous.output[row.col] === row.commit.hash : false
  const color = laneColor(row.col)

  return (
    <svg className="graph-svg" width={width} height={ROW_HEIGHT} aria-hidden="true">
      {row.input.map((hash, index) => {
        if (!hash || index === row.col) return null
        return (
          <line
            key={`pass-${index}`}
            x1={x(index)}
            y1={0}
            x2={x(index)}
            y2={ROW_HEIGHT}
            stroke={laneColor(index)}
          />
        )
      })}
      {continued && <line x1={x(row.col)} y1={0} x2={x(row.col)} y2={mid} stroke={color} />}
      {row.edges.map((edge, index) => {
        const stroke = laneColor(edge.from)
        if (edge.from === edge.to) {
          return <line key={`edge-${index}`} x1={x(edge.from)} y1={mid} x2={x(edge.to)} y2={ROW_HEIGHT} stroke={stroke} />
        }
        const path = `M ${x(edge.from)} ${mid} C ${x(edge.from)} ${mid + 14}, ${x(edge.to)} ${ROW_HEIGHT - 14}, ${x(edge.to)} ${ROW_HEIGHT}`
        return <path key={`edge-${index}`} d={path} stroke={stroke} fill="none" />
      })}
      {row.commit.head && <circle cx={x(row.col)} cy={mid} r={8} fill="none" stroke={color} strokeWidth={1.5} />}
      <circle cx={x(row.col)} cy={mid} r={selected ? 5 : 4} fill={selected ? 'var(--text)' : color} />
    </svg>
  )
}
