import type { Change } from '@shared/types'
import { StatusBadge } from './StatusBadge'

export function Composer({
  changes,
  message,
  busy,
  selected,
  onMessage,
  onCommit,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onSelectChange,
}: {
  changes: Change[]
  message: string
  busy: boolean
  selected: { path: string; staged: boolean } | null
  onMessage: (value: string) => void
  onCommit: () => void
  onStage: (path: string) => void
  onUnstage: (path: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onSelectChange: (change: Change, staged: boolean) => void
}) {
  const staged = changes.filter((change) => change.staged)
  const unstaged = changes.filter((change) => change.unstaged || change.untracked)
  const conflicts = changes.some((change) => change.conflict)
  const canCommit = staged.length > 0 && message.trim().length > 0 && !busy && !conflicts

  return (
    <footer className="composer">
      <div className="changes">
        <div className="panel-head">
          <span>Changes</span>
          <span className="muted">{changes.length}</span>
        </div>
        <div className="changes-scroll">
          {conflicts && <p className="form-error pad">Resolve conflicts before committing.</p>}
          {changes.length === 0 && <p className="muted pad">Working tree clean.</p>}
          {staged.length > 0 && (
            <section>
              <div className="change-label">
                <span>Staged</span>
                <button className="text-button" onClick={onUnstageAll} disabled={busy}>
                  Unstage all
                </button>
              </div>
              {staged.map((change) => (
                <ChangeRow
                  key={`staged-${change.path}`}
                  change={change}
                  staged
                  selected={selected}
                  busy={busy}
                  actionLabel="Unstage"
                  onAction={() => onUnstage(change.path)}
                  onSelect={onSelectChange}
                />
              ))}
            </section>
          )}
          {unstaged.length > 0 && (
            <section>
              <div className="change-label">
                <span>Unstaged</span>
                <button className="text-button" onClick={onStageAll} disabled={busy || conflicts}>
                  Stage all
                </button>
              </div>
              {unstaged.map((change) => (
                <ChangeRow
                  key={`unstaged-${change.path}`}
                  change={change}
                  staged={false}
                  selected={selected}
                  busy={busy}
                  actionLabel="Stage"
                  onAction={() => onStage(change.path)}
                  onSelect={onSelectChange}
                />
              ))}
            </section>
          )}
        </div>
      </div>
      <div className="message-box">
        <textarea
          value={message}
          onChange={(event) => onMessage(event.target.value)}
          placeholder="Commit message"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              if (canCommit) onCommit()
            }
          }}
        />
        <div className="message-actions">
          <span className="muted">Ctrl+Enter to commit</span>
          <button className="primary" onClick={onCommit} disabled={!canCommit} title={conflicts ? 'Resolve conflicts first' : 'Commit staged files'}>
            {staged.length > 0 ? `Commit ${staged.length} file${staged.length === 1 ? '' : 's'}` : 'Commit'}
          </button>
        </div>
      </div>
    </footer>
  )
}

function ChangeRow({
  change,
  staged,
  selected,
  busy,
  actionLabel,
  onAction,
  onSelect,
}: {
  change: Change
  staged: boolean
  selected: { path: string; staged: boolean } | null
  busy: boolean
  actionLabel: string
  onAction: () => void
  onSelect: (change: Change, staged: boolean) => void
}) {
  const on = selected?.path === change.path && selected.staged === staged
  const code = change.conflict ? 'U' : change.untracked ? '?' : staged ? change.index : change.workTree
  const label = change.oldPath ? `${change.oldPath} → ${change.path}` : change.path
  return (
    <div
      className={on ? 'change on' : 'change'}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(change, staged)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(change, staged)
        }
      }}
    >
      <StatusBadge code={code} />
      <span className="file-path" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onAction()
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}
