import { useEffect } from 'react'
import { folderNameFromCloneUrl } from '@shared/clone'

export function CloneModal({
  url,
  destination,
  error,
  busy,
  onUrl,
  onDestination,
  onBrowse,
  onClose,
  onSubmit,
}: {
  url: string
  destination: string
  error: string | null
  busy: boolean
  onUrl: (value: string) => void
  onDestination: (value: string) => void
  onBrowse: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const folder = folderNameFromCloneUrl(url)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal clone-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <h2>Clone repository</h2>
        <label>
          Repository URL
          <input autoFocus value={url} placeholder="https://example.com/team/app.git" onChange={(event) => onUrl(event.target.value)} />
        </label>
        <label>
          Destination folder
          <span className="inline-field">
            <input value={destination} placeholder="Choose a parent folder" onChange={(event) => onDestination(event.target.value)} />
            <button type="button" className="ghost" onClick={onBrowse} disabled={busy}>
              Browse
            </button>
          </span>
        </label>
        {destination.trim() && url.trim() && (
          <p className="muted clone-dest">
            {destination.replace(/[\\/]+$/, '')}
            {destination.includes('\\') ? '\\' : '/'}
            {folder}
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy || !url.trim() || !destination.trim()}>
            Clone
          </button>
        </div>
      </form>
    </div>
  )
}
