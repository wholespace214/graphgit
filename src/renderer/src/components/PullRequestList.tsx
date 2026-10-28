import type { PullRequest } from '@shared/types'

export function PullRequestList({
  requests,
  detail,
  busy,
  onCheckout,
  onCreate,
}: {
  requests: PullRequest[]
  detail: string | null
  busy: boolean
  onCheckout: (number: number) => void
  onCreate: () => void
}) {
  return (
    <>
      <div className="panel-head">
        <span>Pull requests</span>
        <button className="text-button" onClick={onCreate} disabled={busy}>
          New
        </button>
      </div>
      <div className="sidebar-scroll">
        {detail && <p className="muted pad">{detail}</p>}
        {!detail && requests.length === 0 && <p className="muted pad">No open pull requests.</p>}
        {requests.map((request) => (
          <button
            className="branch pr-row"
            key={request.number}
            disabled={busy}
            title={request.url}
            onClick={() => onCheckout(request.number)}
          >
            <span className="branch-name">
              #{request.number} {request.title}
            </span>
            <span className="pr-meta">
              {request.head} → {request.base}
              {request.author ? ` · ${request.author}` : ''}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
