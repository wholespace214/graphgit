import { useEffect, useState } from 'react'

export function WindowControls() {
  const api = window.graphgit
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.isMaximized || !api.onMaximized) return
    void api.isMaximized().then(setMaximized)
    return api.onMaximized(setMaximized)
  }, [api])

  if (!api?.minimize || !api.toggleMaximize || !api.closeWindow) return null

  return (
    <div className="window-controls">
      <button type="button" title="Minimize" onClick={() => void api.minimize()}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" title={maximized ? 'Restore' : 'Maximize'} onClick={() => void api.toggleMaximize()}>
        {maximized ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5h6V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <rect x="2" y="4" width="6" height="6" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
      </button>
      <button type="button" className="close" title="Close" onClick={() => void api.closeWindow()}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}
