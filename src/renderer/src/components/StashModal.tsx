export function StashModal({
  message,
  includeUntracked,
  error,
  busy,
  onMessage,
  onIncludeUntracked,
  onClose,
  onSubmit,
}: {
  message: string
  includeUntracked: boolean
  error: string | null
  busy: boolean
  onMessage: (value: string) => void
  onIncludeUntracked: (value: boolean) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <h2>Stash changes</h2>
        <p className="muted">Saves the current changes and clears the working tree. You can apply them again later.</p>
        <input
          autoFocus
          value={message}
          onChange={(event) => onMessage(event.target.value)}
          placeholder="Message (optional)"
          spellCheck={false}
        />
        <label className="check-row">
          <input type="checkbox" checked={includeUntracked} onChange={(event) => onIncludeUntracked(event.target.checked)} />
          Include untracked files
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Stash
          </button>
        </div>
      </form>
    </div>
  )
}
