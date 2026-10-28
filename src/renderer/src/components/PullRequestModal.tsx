export function PullRequestModal({
  title,
  base,
  error,
  busy,
  onTitle,
  onBase,
  onClose,
  onSubmit,
}: {
  title: string
  base: string
  error: string | null
  busy: boolean
  onTitle: (value: string) => void
  onBase: (value: string) => void
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
        <h2>New pull request</h2>
        <p className="muted">Opens a GitHub pull request from the current branch. The branch must already be pushed.</p>
        <input autoFocus value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Title" spellCheck={false} />
        <input value={base} onChange={(event) => onBase(event.target.value)} placeholder="Base branch" spellCheck={false} />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || title.trim() === '' || base.trim() === ''}>
            Open pull request
          </button>
        </div>
      </form>
    </div>
  )
}
