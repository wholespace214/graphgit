import { useEffect, useState, type FormEvent } from 'react'
import { githubTokenError, githubUsernameError, type GitHubAccounts } from '@shared/github'

export function GitHubSettings() {
  const api = window.graphgit
  const [accounts, setAccounts] = useState<GitHubAccounts | null>(null)
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api?.githubAccounts) return
    let live = true
    void api.githubAccounts().then((next) => {
      if (live) setAccounts(next)
    })
    return () => {
      live = false
    }
  }, [api])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!api?.githubSignIn || busy) return
    const nameError = githubUsernameError(username)
    if (nameError) {
      setError(nameError)
      return
    }
    const tokenError = githubTokenError(token)
    if (tokenError) {
      setError(tokenError)
      return
    }
    setBusy(true)
    setError(null)
    const result = await api.githubSignIn(username.trim(), token.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setUsername('')
    setToken('')
    setAccounts(result.data)
  }

  async function signOut(name: string) {
    if (!api?.githubSignOut || busy) return
    if (!window.confirm(`Remove ${name} from GraphGit? The saved token for that account is deleted from this computer.`)) return
    setBusy(true)
    setError(null)
    const result = await api.githubSignOut(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAccounts(result.data)
  }

  async function makeDefault(name: string) {
    if (!api?.githubSetDefault || busy) return
    setBusy(true)
    setError(null)
    const result = await api.githubSetDefault(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAccounts(result.data)
  }

  if (!api?.githubAccounts) return <p>GitHub sign-in is unavailable in this window.</p>
  if (!accounts) return <p>Checking GitHub accounts.</p>

  return (
    <>
      <p>
        Add each GitHub account with a personal access token. The default account is used for fetch, pull, and push. A repository cloned from another account keeps using that account. Signing in with the same username replaces that token. Tokens stay encrypted on this computer and are not written into Git config.
      </p>
      {accounts.accounts.map((account) => (
        <div className="github-account" key={account.username}>
          <strong>{account.username}</strong>
          {account.default ? (
            <span className="account-chip on">Default</span>
          ) : (
            <button type="button" className="ghost" disabled={busy} onClick={() => void makeDefault(account.username)}>
              Make default
            </button>
          )}
          <button type="button" className="ghost" disabled={busy} onClick={() => void signOut(account.username)}>
            Remove
          </button>
        </div>
      ))}
      <form className="github-form" onSubmit={(event) => void signIn(event)}>
        <label>
          Username
          <input value={username} autoComplete="off" spellCheck={false} disabled={busy} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Personal access token
          <input
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="welcome-actions">
          <button type="submit" className="primary" disabled={busy}>
            {accounts.accounts.length > 0 ? 'Add account' : 'Sign in'}
          </button>
        </div>
      </form>
    </>
  )
}
