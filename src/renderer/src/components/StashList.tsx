import type { StashEntry } from '@shared/types'
import { formatWhen } from '../format'

export function StashList({
  stashes,
  selected,
  busy,
  onSelect,
  onCreate,
  onApply,
  onPop,
  onDrop,
}: {
  stashes: StashEntry[]
  selected: string | null
  busy: boolean
  onSelect: (entry: StashEntry) => void
  onCreate: () => void
  onApply: (entry: StashEntry) => void
  onPop: (entry: StashEntry) => void
  onDrop: (entry: StashEntry) => void
}) {
  return (
    <>
      <div className="panel-head">
        <span>Stash</span>
        <button className="text-button" onClick={onCreate} disabled={busy}>
          New
        </button>
      </div>
      <div className="sidebar-scroll">
        {stashes.length === 0 && <p className="muted pad">No stashes yet.</p>}
        {stashes.map((entry) => (
          <div key={entry.hash} className={selected === entry.selector ? 'stash-row on' : 'stash-row'} title={entry.subject}>
            <button className="branch-main stash-main" disabled={busy} onClick={() => onSelect(entry)}>
              <span className="branch-name">{entry.subject}</span>
              <span className="pr-meta">
                {entry.selector} · {formatWhen(entry.time)}
              </span>
            </button>
            <div className="stash-actions">
              <button className="text-button" title="Apply and keep the stash" disabled={busy} onClick={() => onApply(entry)}>
                Apply
              </button>
              <button className="text-button" title="Apply and remove the stash" disabled={busy} onClick={() => onPop(entry)}>
                Pop
              </button>
              <button className="icon-button" title="Drop stash" disabled={busy} onClick={() => onDrop(entry)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
