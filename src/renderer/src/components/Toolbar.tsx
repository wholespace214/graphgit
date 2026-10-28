import type { BranchHeader } from '@shared/types'
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
  onFetch: () => void
  onPull: () => void
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
        <button className="ghost" onClick={onFetch} disabled={!canFetch} title={fetchTitle}>
          Fetch
        </button>
        <button className="ghost" onClick={onPull} disabled={!canPull} title={pullTitle}>
          Pull
        </button>
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
