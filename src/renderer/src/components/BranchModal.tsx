export function BranchModal({
  name,
  error,
  busy,
  onName,
  onClose,
  onSubmit,
}: {
  name: string
  error: string | null
  busy: boolean
  onName: (value: string) => void
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
        <h2>New branch</h2>
        <p className="muted">Created from the current HEAD and checked out.</p>
        <input
          autoFocus
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="feature/name"
          spellCheck={false}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || name.trim() === ''}>
            Create and checkout
          </button>
        </div>
      </form>
    </div>
  )
}
