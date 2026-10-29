import { useEffect, useRef, useState } from 'react'
import type { BranchHeader, PullMode } from '@shared/types'
import { baseName } from '../format'
import { BackButton } from './BackButton'
import { Logo } from './Logo'
import { SettingsButton } from './SettingsButton'
import { WindowControls } from './WindowControls'

export function Toolbar({
  path,
  header,
  remotes,
  busy,
  onProjects,
  onOpen,
  onRefresh,
  onFetch,
  onPull,
  onPush,
  onSettings,
}: {
  path: string
  header: BranchHeader
  remotes: string[]
  busy: string | null
  onProjects: () => void
  onOpen: () => void
  onRefresh: () => void
  onFetch: (all: boolean) => void
  onPull: (mode: PullMode) => void
  onPush: () => void
  onSettings: () => void
}) {
  const noRemote = remotes.length === 0
  const fetchTitle = noRemote ? 'This repository has no remotes' : 'Fetch'
  const pullTitle = header.detached
    ? 'Detached HEAD'
    : !header.upstream || header.gone
      ? 'No upstream'
      : 'Pull'
  const pushTitle = header.detached ? 'Detached HEAD' : noRemote ? 'This repository has no remotes' : 'Push'
  const canFetch = !busy && !noRemote
  const canPull = !busy && !header.detached && Boolean(header.upstream) && !header.gone
  const canPush = !busy && !header.detached && !noRemote

  return (
    <header className="chrome">
      <div className="chrome-title">
        <div className="brand">
          <Logo size={18} />
          <span>GraphGit</span>
        </div>
        <div className="repo-id">
          <strong title={path}>{baseName(path)}</strong>
          <span className="repo-path" title={path}>
            {path}
          </span>
        </div>
        <span className="branch-pill">{header.detached ? 'Detached HEAD' : header.name}</span>
        {header.upstream && (
          <span className="upstream">
            {header.upstream}
            {header.gone ? ' (gone)' : ''}
          </span>
        )}
        {header.ahead > 0 && <span className="sync ahead">{header.ahead} ahead</span>}
        {header.behind > 0 && <span className="sync behind">{header.behind} behind</span>}
        <div className="spacer" />
        <SettingsButton onClick={onSettings} disabled={Boolean(busy)} />
        {busy && <span className="busy-label">{busy}</span>}
        <WindowControls />
      </div>
      <div className="chrome-actions">
        <BackButton onClick={onProjects} disabled={Boolean(busy)} title="Back to projects" label="Back" />
        <div className="spacer" />
        <button className="ghost" onClick={onRefresh} disabled={Boolean(busy)}>
          Refresh
        </button>
        <SplitButton
          label="Fetch"
          title={fetchTitle}
          disabled={!canFetch}
          items={[
            { id: 'fetch', label: 'Fetch' },
            { id: 'all', label: 'Fetch all' },
          ]}
          onSelect={(id) => onFetch(id === 'all')}
        />
        <SplitButton
          label="Pull"
          title={pullTitle}
          disabled={!canPull}
          items={[
            { id: 'default', label: 'Pull' },
            { id: 'ff', label: 'Pull (fast-forward if possible)' },
            { id: 'ff-only', label: 'Pull (fast-forward only)' },
            { id: 'rebase', label: 'Pull (rebase)' },
          ]}
          onSelect={(id) => onPull(id === 'ff' || id === 'ff-only' || id === 'rebase' ? id : 'default')}
        />
        <button className="ghost" onClick={onPush} disabled={!canPush} title={pushTitle}>
          Push
        </button>
        <button className="primary" onClick={onOpen} disabled={Boolean(busy)}>
          Open
        </button>
      </div>
    </header>
  )
}

function SplitButton({
  label,
  title,
  disabled,
  items,
  onSelect,
}: {
  label: string
  title: string
  disabled: boolean
  items: { id: string; label: string }[]
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={open ? 'split-button open' : 'split-button'} ref={rootRef}>
      <button className="ghost split-main" disabled={disabled} title={title} onClick={() => onSelect(items[0]?.id ?? '')}>
        {label}
      </button>
      <button
        className="ghost split-caret"
        disabled={disabled}
        aria-label={`${label} options`}
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="split-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onSelect(item.id)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
