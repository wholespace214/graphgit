import { useEffect, useState } from 'react'
import type { GitHubRepo } from '@shared/github'

export function GitHubRepos({
  busy,
  onClone,
  onAccount,
}: {
  busy: boolean
  onClone: (account: string, cloneUrl: string) => void
  onAccount?: (account: { username: string; default: boolean } | null) => void
}) {
  const api = window.graphgit
  const [accounts, setAccounts] = useState<{ username: string; default: boolean }[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!api?.githubAccounts) return
    let live = true
    void api.githubAccounts().then((next) => {
      if (!live) return
      setAccounts(next.accounts)
      const preferred = next.accounts.find((account) => account.default)?.username ?? next.accounts[0]?.username ?? null
      setSelected((current) => (current && next.accounts.some((account) => account.username === current) ? current : preferred))
    })
    return () => {
      live = false
    }
  }, [api])

  useEffect(() => {
    onAccount?.(accounts?.find((account) => account.username === selected) ?? null)
  }, [accounts, selected, onAccount])

  useEffect(() => {
    if (!selected || !api?.githubRepos) return
    let live = true
    setLoading(true)
    setError(null)
    setRepos([])
    setTruncated(false)
    void api.githubRepos(selected).then((result) => {
      if (!live) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setRepos(result.data.repos)
      setTruncated(result.data.truncated)
    })
    return () => {
      live = false
    }
  }, [api, selected])

  if (!api?.githubAccounts) return null
  if (!accounts) return <p className="muted github-repos-empty">Checking GitHub accounts.</p>
  if (accounts.length === 0) {
    return <p className="muted github-repos-empty">Sign in to GitHub in Settings to see repositories for each account.</p>
  }

  const needle = query.trim().toLowerCase()
  const visible = needle ? repos.filter((repo) => `${repo.fullName} ${repo.description}`.toLowerCase().includes(needle)) : repos
  const current = accounts.find((account) => account.username === selected)
  const ordered = [...accounts].sort((left, right) => {
    if (left.username === selected) return -1
    if (right.username === selected) return 1
    if (left.default !== right.default) return left.default ? -1 : 1
    return left.username.localeCompare(right.username)
  })

  return (
    <section className="github-repos">
      <div className="github-repos-head">
        <div className="github-selected">
          <strong>{selected}</strong>
          {current?.default && <span className="account-chip on">Default</span>}
        </div>
        {ordered.length > 1 && (
          <div className="account-switch">
            {ordered.map((account) => (
              <button
                key={account.username}
                type="button"
                className={account.username === selected ? 'account-chip on' : 'account-chip'}
                onClick={() => {
                  setQuery('')
                  setSelected(account.username)
                }}
              >
                {account.username}
                {account.default ? ' · Default' : ''}
              </button>
            ))}
          </div>
        )}
        <label className="projects-search">
          <input value={query} placeholder={`Search ${selected ?? 'repositories'}`} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="github-repos-body">
      <p className="muted github-repo-note">
        {current?.default
          ? 'Clone, fetch, pull, and push use this account unless a repository was cloned with another account.'
          : 'Clone uses this account. Later fetch, pull, and push for that repository use it too.'}
      </p>
      {loading && <p className="muted">Loading repositories.</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && visible.length === 0 && <p className="muted">No repositories to show.</p>}
      {visible.map((repo) => (
        <div className="project-card" key={repo.fullName}>
          <div className="project-card-main">
            <strong>{repo.fullName}</strong>
            <span>
              {repo.private ? 'Private' : 'Public'}
              {repo.fork ? ' · Fork' : ''}
              {repo.archived ? ' · Archived' : ''}
              {repo.updatedAt ? ` · ${repo.updatedAt.slice(0, 10)}` : ''}
              {repo.description ? ` · ${repo.description}` : ''}
            </span>
          </div>
          <button type="button" className="ghost github-repo-clone" disabled={busy || !selected} onClick={() => selected && onClone(selected, repo.cloneUrl)}>
            Clone
          </button>
        </div>
      ))}
      {truncated && <p className="muted">Showing the 500 most recently updated repositories.</p>}
      </div>
    </section>
  )
}
