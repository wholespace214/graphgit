import path from 'node:path'
import { githubTokenError, githubUsernameError, redactSecret, type GitHubAccounts, type GitHubRepo, type GitHubRepoList } from '../shared/github'

export class GitHubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubError'
  }
}

export const GITHUB_ACCOUNT_LIMIT = 8

export type GitHubSecretAccount = { username: string; token: string }
export type GitHubRepoLink = { path: string; username: string }
export type GitHubState = {
  accounts: GitHubSecretAccount[]
  defaultUsername: string | null
  repos: GitHubRepoLink[]
}

let state: GitHubState = emptyGitHubState()
let persistGitHubState: ((next: GitHubState) => Promise<void>) | null = null

export function emptyGitHubState(): GitHubState {
  return { accounts: [], defaultUsername: null, repos: [] }
}

export function setGitHubPersister(fn: ((next: GitHubState) => Promise<void>) | null) {
  persistGitHubState = fn
}

export function currentGitHubState(): GitHubState {
  return state
}

export function setGitHubState(next: GitHubState) {
  state = next
}

export function publicGitHubAccounts(next: GitHubState = state): GitHubAccounts {
  const selected = next.defaultUsername?.toLowerCase() ?? ''
  return {
    accounts: next.accounts.map((account) => ({
      username: account.username,
      default: account.username.toLowerCase() === selected,
    })),
  }
}

export function gitHubSignedIn(): boolean {
  return state.accounts.length > 0
}

export function hasGitHubAccount(username: string): boolean {
  return Boolean(findAccount(username))
}

export function defaultGitHubUsername(): string | undefined {
  return findAccount(state.defaultUsername)?.username
}

export function accountForOwner(owner: string | undefined): string | undefined {
  return findAccount(owner)?.username
}

export function accountForRepo(repoPath: string): string | undefined {
  const key = repoKey(repoPath)
  const link = state.repos.find((repo) => repoKey(repo.path) === key)
  return findAccount(link?.username)?.username
}

export function redactSecrets(text: string): string {
  const secrets = state.accounts.map((account) => account.token).sort((left, right) => right.length - left.length)
  return secrets.reduce((next, secret) => redactSecret(next, secret), text)
}

export function githubNetworkEnv(username?: string): Record<string, string> {
  const account = username ? findAccount(username) : findAccount(state.defaultUsername)
  if (!account) return {}
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: bearer ${account.token}`,
  }
}

export function withGitHubAccount(current: GitHubState, account: GitHubSecretAccount): GitHubState {
  const username = account.username.trim()
  const token = account.token.trim()
  if (githubUsernameError(username) || githubTokenError(token)) throw new GitHubError('That GitHub account cannot be saved.')
  const key = username.toLowerCase()
  const existing = current.accounts.some((item) => item.username.toLowerCase() === key)
  if (!existing && current.accounts.length >= GITHUB_ACCOUNT_LIMIT) {
    throw new GitHubError('GraphGit can keep 8 GitHub accounts. Remove one, then add another.')
  }
  const accounts = existing
    ? current.accounts.map((item) => (item.username.toLowerCase() === key ? { username, token } : item))
    : [...current.accounts, { username, token }]
  let defaultUsername = findName(accounts, current.defaultUsername) ?? (accounts.length === 1 ? username : null)
  if (defaultUsername?.toLowerCase() === key) defaultUsername = username
  if (!defaultUsername) defaultUsername = accounts[0]?.username ?? null
  const repos = current.repos.map((repo) => (repo.username.toLowerCase() === key ? { path: repo.path, username } : repo))
  return { accounts, defaultUsername, repos }
}

export function withoutGitHubAccount(current: GitHubState, username: string): GitHubState {
  const key = username.trim().toLowerCase()
  if (!current.accounts.some((account) => account.username.toLowerCase() === key)) {
    throw new GitHubError('That GitHub account is not signed in.')
  }
  const accounts = current.accounts.filter((account) => account.username.toLowerCase() !== key)
  const repos = current.repos.filter((repo) => repo.username.toLowerCase() !== key)
  const defaultUsername = findName(accounts, current.defaultUsername) ?? accounts[0]?.username ?? null
  return { accounts, defaultUsername, repos }
}

export function withDefaultGitHubAccount(current: GitHubState, username: string): GitHubState {
  const match = findIn(current.accounts, username)
  if (!match) throw new GitHubError('That GitHub account is not signed in.')
  return { ...current, defaultUsername: match.username }
}

export function withRepoAccount(current: GitHubState, repoPath: string, username: string): GitHubState {
  const match = findIn(current.accounts, username)
  if (!match) throw new GitHubError('That GitHub account is not signed in.')
  const resolved = path.resolve(repoPath)
  if (!resolved || resolved.length > 1024 || resolved.includes('\0')) throw new GitHubError('Invalid repository path')
  const key = repoKey(resolved)
  const repos = current.repos.filter((repo) => repoKey(repo.path) !== key)
  repos.push({ path: resolved, username: match.username })
  while (repos.length > 200) repos.shift()
  return { ...current, repos }
}

export async function rememberRepoAccount(repoPath: string, username: string) {
  const next = withRepoAccount(state, repoPath, username)
  state = next
  try {
    await persistGitHubState?.(next)
  } catch {
    // The clone already finished. This session still uses the selected account.
  }
}

export function githubPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function assertGitHubSlug(slug: string): string {
  const parts = slug.split('/')
  if (parts.length !== 2 || parts.some((part) => !part || part === '.' || part === '..' || part.includes('..'))) {
    throw new GitHubError('Invalid GitHub repository')
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0] ?? '') || !/^[A-Za-z0-9_.-]+$/.test(parts[1] ?? '')) {
    throw new GitHubError('Invalid GitHub repository')
  }
  return slug
}

export async function verifyGitHubAccount(username: string, token: string): Promise<GitHubSecretAccount> {
  const nameError = githubUsernameError(username)
  if (nameError) throw new GitHubError(nameError)
  const tokenError = githubTokenError(token)
  if (tokenError) throw new GitHubError(tokenError)
  const value = token.trim()
  const user = await githubJson<{ login?: unknown }>('/user', value)
  const login = typeof user.value.login === 'string' ? user.value.login : ''
  if (githubUsernameError(login) || login.toLowerCase() !== username.trim().toLowerCase()) {
    throw new GitHubError(githubUsernameError(login) ? 'GitHub did not return an account name.' : `That token belongs to ${login}.`)
  }
  return { username: login, token: value }
}

export async function githubSessionJson<T>(path: string, username?: string, init?: { method?: string; body?: string }): Promise<T> {
  const account = username ? findAccount(username) : findAccount(state.defaultUsername)
  if (!account) throw new GitHubError('Sign in to GitHub in Settings.')
  const response = await githubJson<T>(path, account.token, init)
  return response.value
}

export async function listGitHubRepos(username: string): Promise<GitHubRepoList> {
  const account = findAccount(username)
  if (!account) throw new GitHubError('That GitHub account is not signed in.')
  const repos: GitHubRepo[] = []
  let requestPath = '/user/repos?per_page=100&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member'
  for (let page = 0; page < 5; page += 1) {
    const response = await githubJson<unknown[]>(requestPath, account.token)
    if (!Array.isArray(response.value)) throw new GitHubError('GitHub returned an unreadable response.')
    for (const row of response.value) {
      const repo = mapRepo(row)
      if (repo) repos.push({ ...repo, description: redactSecret(repo.description, account.token) })
    }
    if (!response.next) return { repos, truncated: false }
    requestPath = response.next
  }
  return { repos, truncated: true }
}

function findAccount(username: string | null | undefined): GitHubSecretAccount | undefined {
  return findIn(state.accounts, username)
}

function findIn(accounts: GitHubSecretAccount[], username: string | null | undefined): GitHubSecretAccount | undefined {
  if (!username) return undefined
  const key = username.trim().toLowerCase()
  return accounts.find((account) => account.username.toLowerCase() === key)
}

function findName(accounts: GitHubSecretAccount[], username: string | null): string | null {
  return findIn(accounts, username)?.username ?? null
}

function repoKey(repoPath: string): string {
  const resolved = path.resolve(repoPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function mapRepo(row: unknown): GitHubRepo | null {
  if (!row || typeof row !== 'object') return null
  const record = row as {
    name?: unknown
    full_name?: unknown
    private?: unknown
    fork?: unknown
    archived?: unknown
    description?: unknown
    updated_at?: unknown
  }
  if (typeof record.full_name !== 'string' || typeof record.name !== 'string') return null
  let slug = ''
  try {
    slug = assertGitHubSlug(record.full_name)
  } catch {
    return null
  }
  const description = typeof record.description === 'string' ? record.description.replace(/[\0-\x1f\x7f]/g, ' ').trim().slice(0, 180) : ''
  const updatedAt = typeof record.updated_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(record.updated_at) ? record.updated_at : ''
  return {
    name: record.name.replace(/[\0-\x1f\x7f]/g, '').slice(0, 120),
    fullName: slug,
    private: record.private === true,
    fork: record.fork === true,
    archived: record.archived === true,
    description,
    updatedAt,
    cloneUrl: `https://github.com/${slug}.git`,
  }
}

async function githubJson<T>(pathName: string, token: string, init?: { method?: string; body?: string }): Promise<{ value: T; next: string | null }> {
  if (!pathName.startsWith('/') || pathName.startsWith('//') || pathName.includes('://')) throw new GitHubError('Invalid GitHub request')
  const url = new URL(pathName, 'https://api.github.com')
  if (url.origin !== 'https://api.github.com') throw new GitHubError('Invalid GitHub request')
  let response: Response
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GraphGit',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body,
    })
  } catch {
    throw new GitHubError('Could not reach GitHub.')
  }
  if (response.type === 'opaqueredirect' || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    throw new GitHubError('GitHub redirected the request.')
  }
  const next = nextPath(response.headers.get('link'))
  const text = await response.text()
  if (response.status === 401) throw new GitHubError('GitHub rejected that token.')
  if (!response.ok) {
    let message = `GitHub returned ${response.status}.`
    try {
      const parsed = JSON.parse(text) as { message?: unknown }
      if (typeof parsed.message === 'string' && parsed.message.trim()) message = parsed.message.trim()
    } catch {
      message = `GitHub returned ${response.status}.`
    }
    throw new GitHubError(redactSecret(message, token).slice(0, 500))
  }
  try {
    return { value: JSON.parse(text) as T, next }
  } catch {
    throw new GitHubError('GitHub returned an unreadable response.')
  }
}

function nextPath(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (!match?.[1]) continue
    try {
      const url = new URL(match[1])
      if (url.origin !== 'https://api.github.com' || !url.pathname.startsWith('/')) return null
      return `${url.pathname}${url.search}`
    } catch {
      return null
    }
  }
  return null
}
