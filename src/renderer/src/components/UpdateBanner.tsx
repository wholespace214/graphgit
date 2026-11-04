import { useState } from 'react'
import { useUpdateState } from '../useUpdate'

export function UpdateBanner() {
  const state = useUpdateState()
  const [hiddenRevision, setHiddenRevision] = useState<number | null>(null)
  if (!state || hiddenRevision === state.revision) return null

  const version = state.availableVersion
  if (state.phase === 'downloading' && version) {
    return (
      <div className="update-banner" role="status">
        <p>
          Downloading GraphGit {version}
          {state.percent == null ? '' : ` (${state.percent}%)`}
        </p>
        {state.percent != null && (
          <div className="update-progress" aria-hidden="true">
            <span style={{ width: `${state.percent}%` }} />
          </div>
        )}
      </div>
    )
  }

  if (state.phase === 'ready' && version) {
    return (
      <div className="update-banner" role="status">
        <p>
          <strong>GraphGit {version} is ready.</strong> {state.detail ?? 'Restart to install it.'}
        </p>
        <div className="update-actions">
          <button type="button" className="primary" onClick={() => void window.graphgit.installUpdate()}>
            Restart and install
          </button>
          <button type="button" className="ghost" onClick={() => setHiddenRevision(state.revision)}>
            Later
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'error' && version && state.detail) {
    return (
      <div className="update-banner" role="status">
        <p>{state.detail}</p>
        <div className="update-actions">
          <button type="button" className="ghost" onClick={() => setHiddenRevision(state.revision)}>
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return null
}
