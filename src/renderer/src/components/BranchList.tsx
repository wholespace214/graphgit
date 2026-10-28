import type { BranchInfo } from '@shared/types'

export function BranchList({
  branches,
  busy,
  onCheckout,
  onNewBranch,
  onDelete,
}: {
  branches: BranchInfo[]
  busy: boolean
  onCheckout: (name: string) => void
  onNewBranch: () => void
  onDelete: (name: string) => void
}) {
  const locals = branches.filter((branch) => !branch.remote)
  const groups = new Map<string, BranchInfo[]>()
  for (const branch of branches) {
    if (!branch.remote) continue
    const key = branch.name.split('/')[0] || 'remote'
    const list = groups.get(key) ?? []
    list.push(branch)
    groups.set(key, list)
  }

  return (
    <>
      <div className="panel-head">
        <span>Branches</span>
        <button className="text-button" onClick={onNewBranch} disabled={busy}>
          New
        </button>
      </div>
      <div className="sidebar-scroll">
        <section>
          <h2>Local</h2>
          {locals.length === 0 && <p className="muted pad">No branches yet.</p>}
          {locals.map((branch) => (
            <BranchRow key={branch.name} branch={branch} busy={busy} onCheckout={onCheckout} onDelete={onDelete} />
          ))}
        </section>
        {[...groups.entries()].map(([remote, remoteBranches]) => (
          <section key={remote}>
            <h2>{remote}</h2>
            {remoteBranches.map((branch) => (
              <BranchRow key={branch.name} branch={branch} busy={busy} onCheckout={onCheckout} onDelete={onDelete} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

function BranchRow({
  branch,
  busy,
  onCheckout,
  onDelete,
}: {
  branch: BranchInfo
  busy: boolean
  onCheckout: (name: string) => void
  onDelete: (name: string) => void
}) {
  const short = branch.remote ? branch.name.slice(branch.name.indexOf('/') + 1) : branch.name
  return (
    <div className={branch.current ? 'branch current' : 'branch'} title={branch.upstream ? `${branch.name} → ${branch.upstream}` : branch.name}>
      <button className="branch-main" disabled={busy || branch.current} onClick={() => onCheckout(branch.name)}>
        <span className="branch-name">{short}</span>
        {branch.current && <span className="current-dot" />}
      </button>
      {!branch.remote && !branch.current && (
        <button className="icon-button" title="Delete local branch" disabled={busy} onClick={() => onDelete(branch.name)}>
          ×
        </button>
      )}
    </div>
  )
}
