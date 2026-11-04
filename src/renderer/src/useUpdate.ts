import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'

export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let live = true
    const apply = (next: UpdateState) => {
      if (!live) return
      setState((current) => (!current || next.revision >= current.revision ? next : current))
    }
    const stop = window.graphgit.onUpdateState(apply)
    void window.graphgit.updateState().then(apply)
    return () => {
      live = false
      stop()
    }
  }, [])
  return state
}

export function updateStatus(state: UpdateState): string {
  switch (state.phase) {
    case 'disabled':
      return state.detail ?? 'Updates are unavailable.'
    case 'idle':
      return `Version ${state.currentVersion}. GraphGit checks GitHub Releases in the background.`
    case 'checking':
      return `Checking for updates. You are on ${state.currentVersion}.`
    case 'downloading': {
      const version = state.availableVersion ?? 'the update'
      const percent = state.percent == null ? '' : ` (${state.percent}%)`
      return `Downloading ${version}${percent}.`
    }
    case 'ready':
      return state.detail ?? `${state.availableVersion ?? 'The update'} is ready. Restart to install it.`
    case 'current':
      return `Version ${state.currentVersion} is the latest release.`
    case 'error':
      return state.detail ?? 'Could not check for updates.'
  }
}
