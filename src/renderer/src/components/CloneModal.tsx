import { useEffect, useRef } from 'react'
import { folderNameFromCloneUrl } from '@shared/clone'

export function CloneModal({
  url,
  folder,
  destination,
  error,
  busy,
  onUrl,
  onFolder,
  onDestination,
  onBrowse,
  onClose,
  onSubmit,
}: {
  url: string
  folder: string
  destination: string
  error: string | null
  busy: boolean
  onUrl: (value: string) => void
  onFolder: (value: string) => void
  onDestination: (value: string) => void
  onBrowse: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const folderEdited = useRef(false)

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
          <input
            autoFocus
            value={url}
            placeholder="https://example.com/team/app.git"
            onChange={(event) => {
              const next = event.target.value
              onUrl(next)
              if (!folderEdited.current) onFolder(folderNameFromCloneUrl(next))
            }}
          />
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
        <label>
          Folder name
          <input
            value={folder}
            onChange={(event) => {
              folderEdited.current = true
              onFolder(event.target.value)
            }}
          />
        </label>
        {destination && folder.trim() && (
          <p className="muted clone-dest">
            {destination.replace(/[\\/]+$/, '')}
            {destination.includes('\\') ? '\\' : '/'}
            {folder.trim()}
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy || !url.trim() || !destination.trim() || !folder.trim()}>
            Clone
          </button>
        </div>
      </form>
    </div>
  )
}
