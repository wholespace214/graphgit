import { useEffect, useRef, useState } from 'react'
import type { Change, ConflictSide, Contributor, RepoOperation } from '@shared/types'
import { CHANGES_MIN, MESSAGE_MIN, clamp } from '../layout'
import { StatusBadge } from './StatusBadge'
import { WidthHandle } from './WidthHandle'

export function Composer({
  changes,
  changesWidth,
  height,
  message,
  contributors,
  withUsers,
  busy,
  selected,
  onMessage,
  onWithUsers,
  onChangesWidth,
  onCommit,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onStash,
  onSelectChange,
  operation,
  amend,
  canAmend,
  onAmend,
  onDiscard,
  onTakeSide,
  onContinue,
  onAbort,
}: {
  changes: Change[]
  changesWidth: number | null
  height: number
  message: string
  contributors: Contributor[]
  withUsers: Contributor[]
  busy: boolean
  selected: { path: string; staged: boolean } | null
  onMessage: (value: string) => void
  onWithUsers: (people: Contributor[]) => void
  onChangesWidth: (width: number | null) => void
  onCommit: (people: Contributor[]) => void
  onStage: (path: string) => void
  onUnstage: (path: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onStash: () => void
  onSelectChange: (change: Change, staged: boolean) => void
  operation: RepoOperation | null
  amend: boolean
  canAmend: boolean
  onAmend: (value: boolean) => void
  onDiscard: (path: string) => void
  onTakeSide: (path: string, side: ConflictSide) => void
  onContinue: () => void
  onAbort: () => void
}) {
  const staged = changes.filter((change) => change.staged)
  const unstaged = changes.filter((change) => change.unstaged || change.untracked)
  const conflicts = changes.some((change) => change.conflict)
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [withError, setWithError] = useState<string | null>(null)
  const footerRef = useRef<HTMLElement>(null)
  const [composerWidth, setComposerWidth] = useState(0)
  const changesRef = useRef<number | null>(changesWidth)
  useEffect(() => {
    const el = footerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setComposerWidth(el.clientWidth))
    observer.observe(el)
    setComposerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  const changesMax = composerWidth > 0 ? Math.max(CHANGES_MIN, composerWidth - MESSAGE_MIN - 8) : 1200
  const shownChanges = changesWidth == null ? null : clamp(changesWidth, CHANGES_MIN, changesMax)
  changesRef.current = shownChanges
  const count = staged.length > 0 ? staged.length : unstaged.length
  const known = contributors.filter((person) => !withUsers.some((chosen) => chosen.email.toLowerCase() === person.email.toLowerCase()))
  const draftName = personName.trim()
  const draftEmail = personEmail.trim()
  const emailOk = draftEmail.length > 0 && draftEmail.length <= 200 && !/[\s<>]/.test(draftEmail) && draftEmail.includes('@')
  const canAdd = draftName.length > 0 && draftName.length <= 100 && emailOk && !withUsers.some((person) => person.email.toLowerCase() === draftEmail.toLowerCase())
  const amending = amend && canAmend
  const canCommit = message.trim().length > 0 && !busy && !conflicts && (amending || count > 0)
  const commitTitle = conflicts
    ? 'Resolve conflicts first'
    : amending
      ? message.trim().length === 0
        ? 'Enter a commit message'
        : 'Amend the latest commit'
      : count === 0
        ? 'Nothing to commit'
        : message.trim().length === 0
          ? 'Enter a commit message'
          : staged.length > 0
            ? 'Commit staged files'
            : 'Commit all changes'
  const operationName = operation === 'cherry-pick' ? 'Cherry-pick' : operation === 'rebase' ? 'Rebase' : operation === 'revert' ? 'Revert' : 'Merge'

  function peopleForCommit(): Contributor[] | null {
    if (!draftName && !draftEmail) return withUsers
    if (!draftName || !emailOk) return null
    if (withUsers.some((person) => person.email.toLowerCase() === draftEmail.toLowerCase())) return withUsers
    return [...withUsers, { name: draftName, email: draftEmail }]
  }

  function commitNow() {
    if (!canCommit) return
    const people = peopleForCommit()
    if (!people) {
      setWithError('Enter both a name and an email, or clear the With fields.')
      return
    }
    setWithError(null)
    onWithUsers(people)
    setPersonName('')
    setPersonEmail('')
    onCommit(people)
  }

  return (
    <footer
      className="composer"
      ref={footerRef}
      style={{
        height,
        ...(shownChanges == null ? {} : { gridTemplateColumns: `${shownChanges}px 8px minmax(${MESSAGE_MIN}px, 1fr)` }),
      }}
    >
      <div className="changes">
        <div className="panel-head">
          <span>Changes</span>
          <span className="panel-head-actions">
            <button className="text-button" onClick={onStash} disabled={busy || changes.length === 0}>
              Stash
            </button>
            <span className="muted">{changes.length}</span>
          </span>
        </div>
        <div className="changes-scroll">
          {operation && (
            <div className="op-banner">
              <p>
                {operationName} in progress.
                {operation === 'rebase' ? ' During a rebase, Ours is the branch you are rebasing onto.' : ''}
              </p>
              <div className="op-actions">
                <button type="button" className="primary" disabled={busy || conflicts} onClick={onContinue}>
                  Continue
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={onAbort}>
                  Abort
                </button>
              </div>
            </div>
          )}
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
                  onDiscard={() => onDiscard(change.path)}
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
                  actionLabel={change.conflict ? 'Resolved' : 'Stage'}
                  onAction={() => onStage(change.path)}
                  onDiscard={() => onDiscard(change.path)}
                  onTakeSide={change.conflict ? (side) => onTakeSide(change.path, side) : undefined}
                  onSelect={onSelectChange}
                />
              ))}
            </section>
          )}
        </div>
      </div>
      <WidthHandle
        label="Resize changes"
        onDrag={(delta) => {
          const total = footerRef.current?.clientWidth ?? composerWidth
          const max = total > 0 ? Math.max(CHANGES_MIN, total - MESSAGE_MIN - 8) : changesMax
          const base = changesRef.current ?? (total > 0 ? (total - 8) / 2 : 480)
          const next = clamp(base + delta, CHANGES_MIN, max)
          changesRef.current = next
          onChangesWidth(next)
        }}
        onReset={() => onChangesWidth(null)}
      />
      <div className="message-box">
        <textarea
          value={message}
          onChange={(event) => onMessage(event.target.value)}
          placeholder="Commit message"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              commitNow()
            }
          }}
        />
        <div className="with-people">
          <span className="muted">With</span>
          {known.length > 0 && (
            <select
              value=""
              disabled={busy}
              onChange={(event) => {
                const person = known.find((item) => item.email === event.target.value)
                if (!person) return
                onWithUsers([...withUsers, person])
              }}
            >
              <option value="">Another person</option>
              {known.map((person) => (
                <option key={person.email} value={person.email}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={personName}
            placeholder="Name"
            disabled={busy}
            list="commit-people"
            onChange={(event) => {
              const next = event.target.value
              setPersonName(next)
              const match = contributors.find((person) => person.name === next)
              if (match) setPersonEmail(match.email)
            }}
          />
          <input value={personEmail} placeholder="Email" disabled={busy} onChange={(event) => setPersonEmail(event.target.value)} />
          <button
            type="button"
            className="text-button"
            disabled={busy || !canAdd}
            onClick={() => {
              onWithUsers([...withUsers, { name: draftName, email: draftEmail }])
              setPersonName('')
              setPersonEmail('')
            }}
          >
            Add
          </button>
          <datalist id="commit-people">
            {known.map((person) => (
              <option key={person.email} value={person.name} />
            ))}
          </datalist>
        </div>
        {withError && <p className="form-error">{withError}</p>}
        {withUsers.length > 0 && (
          <div className="with-chips">
            {withUsers.map((person) => (
              <button
                type="button"
                className="with-chip"
                key={person.email}
                disabled={busy}
                title={person.email}
                onClick={() => onWithUsers(withUsers.filter((item) => item.email !== person.email))}
              >
                {person.name} ×
              </button>
            ))}
          </div>
        )}
        <label className="amend-row">
          <input type="checkbox" checked={amend && canAmend} disabled={busy || !canAmend} onChange={(event) => onAmend(event.target.checked)} />
          Amend latest commit
        </label>
        <div className="message-actions">
          <span className="muted">Ctrl+Enter to commit</span>
          <button className="primary" onClick={commitNow} disabled={!canCommit} title={commitTitle}>
            {amending ? 'Amend' : count > 0 ? `Commit ${count} file${count === 1 ? '' : 's'}` : 'Commit'}
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
  onDiscard,
  onTakeSide,
  onSelect,
}: {
  change: Change
  staged: boolean
  selected: { path: string; staged: boolean } | null
  busy: boolean
  actionLabel: string
  onAction: () => void
  onDiscard: () => void
  onTakeSide?: (side: ConflictSide) => void
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
      <span className="change-actions">
        {onTakeSide && (
          <>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              title="Keep the current branch version"
              onClick={(event) => {
                event.stopPropagation()
                onTakeSide('ours')
              }}
            >
              Ours
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              title="Keep the incoming version"
              onClick={(event) => {
                event.stopPropagation()
                onTakeSide('theirs')
              }}
            >
              Theirs
            </button>
          </>
        )}
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            onDiscard()
          }}
        >
          Discard
        </button>
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
      </span>
    </div>
  )
}
