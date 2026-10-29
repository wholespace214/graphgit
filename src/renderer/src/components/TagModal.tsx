export function TagModal({
  name,
  message,
  error,
  busy,
  onName,
  onMessage,
  onClose,
  onSubmit,
}: {
  name: string
  message: string
  error: string | null
  busy: boolean
  onName: (value: string) => void
  onMessage: (value: string) => void
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
        <h2>New tag</h2>
        <p className="muted">Points at the current HEAD. A message makes it an annotated tag.</p>
        <input autoFocus value={name} onChange={(event) => onName(event.target.value)} placeholder="v0.1.0" spellCheck={false} />
        <input value={message} onChange={(event) => onMessage(event.target.value)} placeholder="Message (optional)" spellCheck={false} />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || name.trim() === ''}>
            Create tag
          </button>
        </div>
      </form>
    </div>
  )
}
