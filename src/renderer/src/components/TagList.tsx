import type { TagInfo } from '@shared/types'

export function TagList({
  tags,
  head,
  detached,
  busy,
  canPush,
  onCheckout,
  onCreate,
  onDelete,
  onPush,
}: {
  tags: TagInfo[]
  head: string | null
  detached: boolean
  busy: boolean
  canPush: boolean
  onCheckout: (name: string) => void
  onCreate: () => void
  onDelete: (name: string) => void
  onPush: (name: string) => void
}) {
  return (
    <>
      <div className="panel-head">
        <span>Tags</span>
        <button className="text-button" onClick={onCreate} disabled={busy}>
          New
        </button>
      </div>
      <div className="sidebar-scroll">
        {tags.length === 0 && <p className="muted pad">No tags yet.</p>}
        {tags.map((tag) => {
          const current = detached && head === tag.commit
          return (
            <div className={current ? 'branch current' : 'branch'} key={tag.name} title={tag.name}>
              <button className="branch-main" disabled={busy || current} onClick={() => onCheckout(tag.name)}>
                <span className="branch-name">{tag.name}</span>
                {current && <span className="current-dot" />}
              </button>
              {canPush && (
                <button className="text-button" title="Push tag" disabled={busy} onClick={() => onPush(tag.name)}>
                  Push
                </button>
              )}
              <button className="icon-button" title="Delete tag" disabled={busy} onClick={() => onDelete(tag.name)}>
                ×
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
