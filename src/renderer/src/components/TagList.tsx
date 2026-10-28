import type { RemoteTag, TagInfo } from '@shared/types'

export function TagList({
  tags,
  remoteTags,
  remoteName,
  remoteDetail,
  remoteReady,
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
  remoteTags: RemoteTag[]
  remoteName: string | null
  remoteDetail: string | null
  remoteReady: boolean
  head: string | null
  detached: boolean
  busy: boolean
  canPush: boolean
  onCheckout: (name: string) => void
  onCreate: () => void
  onDelete: (name: string) => void
  onPush: (name: string) => void
}) {
  const pushed = new Set(remoteTags.map((tag) => tag.name))
  return (
    <>
      <div className="panel-head">
        <span>Tags</span>
        <button className="text-button" onClick={onCreate} disabled={busy}>
          New
        </button>
      </div>
      <div className="sidebar-scroll">
        <section>
          <h2>Local</h2>
          {tags.length === 0 && <p className="muted pad">No tags yet.</p>}
          {tags.map((tag) => (
            <TagRow
              key={`local-${tag.name}`}
              name={tag.name}
              current={detached && head === tag.commit}
              busy={busy}
              showPush={canPush && remoteReady && !pushed.has(tag.name)}
              showDelete
              onCheckout={onCheckout}
              onDelete={onDelete}
              onPush={onPush}
            />
          ))}
        </section>
        {remoteName && (
          <section>
            <h2>{remoteName}</h2>
            {remoteDetail && <p className="muted pad">{remoteDetail}</p>}
            {!remoteDetail && remoteTags.length === 0 && <p className="muted pad">No remote tags.</p>}
            {remoteTags.map((tag) => (
              <TagRow
                key={`remote-${tag.name}`}
                name={tag.name}
                current={detached && head === tag.commit}
                busy={busy}
                showPush={false}
                showDelete={false}
                onCheckout={onCheckout}
                onDelete={onDelete}
                onPush={onPush}
              />
            ))}
          </section>
        )}
      </div>
    </>
  )
}

function TagRow({
  name,
  current,
  busy,
  showPush,
  showDelete,
  onCheckout,
  onDelete,
  onPush,
}: {
  name: string
  current: boolean
  busy: boolean
  showPush: boolean
  showDelete: boolean
  onCheckout: (name: string) => void
  onDelete: (name: string) => void
  onPush: (name: string) => void
}) {
  return (
    <div className={current ? 'branch current' : 'branch'} title={name}>
      <button className="branch-main" disabled={busy || current} onClick={() => onCheckout(name)}>
        <span className="branch-name">{name}</span>
        {current && <span className="current-dot" />}
      </button>
      {showPush && (
        <button className="text-button" title="Push tag" disabled={busy} onClick={() => onPush(name)}>
          Push
        </button>
      )}
      {showDelete && (
        <button className="icon-button" title="Delete tag" disabled={busy} onClick={() => onDelete(name)}>
          ×
        </button>
      )}
    </div>
  )
}
