import { app, safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { githubTokenError, githubUsernameError } from '../shared/github'
import { emptyGitHubState, GitHubError, type GitHubSecretAccount, type GitHubState } from './githubSession'

function accountsFile(): string {
  return path.join(app.getPath('userData'), 'github-accounts.bin')
}

function legacyFile(): string {
  return path.join(app.getPath('userData'), 'github-account.bin')
}

export async function loadStoredGitHubAccounts(): Promise<GitHubState> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return emptyGitHubState()
  const currentPath = accountsFile()
  if (existsSync(currentPath)) {
    const current = await readState(currentPath)
    if (!current) return emptyGitHubState()
    if (current.refresh && current.state.accounts.length > 0) await storeGitHubAccounts(current.state)
    return current.state
  }
  const legacy = await readState(legacyFile())
  if (!legacy || legacy.state.accounts.length === 0) return emptyGitHubState()
  await storeGitHubAccounts(legacy.state)
  await rm(legacyFile(), { force: true })
  return legacy.state
}

export async function storeGitHubAccounts(state: GitHubState) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new GitHubError('This computer cannot store a GitHub token safely.')
  }
  const file = accountsFile()
  if (state.accounts.length === 0) {
    await rm(file, { force: true })
    await rm(legacyFile(), { force: true })
    return
  }
  await mkdir(path.dirname(file), { recursive: true })
  const payload = JSON.stringify({
    defaultUsername: state.defaultUsername,
    accounts: state.accounts.map((account) => ({ username: account.username, token: account.token })),
    repos: state.repos.map((repo) => ({ path: repo.path, username: repo.username })),
  })
  const encrypted = await safeStorage.encryptStringAsync(payload)
  await writeFile(file, encrypted, { mode: 0o600 })
}

async function readState(file: string): Promise<{ state: GitHubState; refresh: boolean } | null> {
  let encrypted: Buffer
  try {
    encrypted = await readFile(file)
  } catch {
    return null
  }
  let text = ''
  let refresh = false
  try {
    let decrypted = await safeStorage.decryptStringAsync(encrypted)
    refresh = decrypted.shouldReEncrypt
    if (refresh) decrypted = await safeStorage.decryptStringAsync(encrypted)
    text = decrypted.result
    const state = parseState(text)
    return state ? { state, refresh } : null
  } catch {
    return null
  }
}

function parseState(text: string): GitHubState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as {
    username?: unknown
    token?: unknown
    defaultUsername?: unknown
    accounts?: unknown
    repos?: unknown
  }
  const source = Array.isArray(record.accounts)
    ? record.accounts
    : typeof record.username === 'string' && typeof record.token === 'string'
      ? [{ username: record.username, token: record.token }]
      : null
  if (!source) return null
  const accounts: GitHubSecretAccount[] = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const row = item as { username?: unknown; token?: unknown }
    const username = typeof row.username === 'string' ? row.username.trim() : ''
    const token = typeof row.token === 'string' ? row.token.trim() : ''
    if (githubUsernameError(username) || githubTokenError(token)) continue
    if (accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) continue
    accounts.push({ username, token })
    if (accounts.length >= 8) break
  }
  if (accounts.length === 0) return emptyGitHubState()
  const requested = typeof record.defaultUsername === 'string' ? record.defaultUsername : accounts[0]?.username
  const defaultUsername = accounts.find((account) => account.username.toLowerCase() === requested?.trim().toLowerCase())?.username ?? accounts[0]?.username ?? null
  const repos: GitHubState['repos'] = []
  if (Array.isArray(record.repos)) {
    for (const item of record.repos) {
      if (!item || typeof item !== 'object') continue
      const row = item as { path?: unknown; username?: unknown }
      const repoPath = typeof row.path === 'string' ? path.resolve(row.path) : ''
      const username = accounts.find((account) => account.username.toLowerCase() === (typeof row.username === 'string' ? row.username.trim().toLowerCase() : ''))?.username
      if (!repoPath || repoPath.length > 1024 || repoPath.includes('\0') || !username) continue
      if (repos.some((repo) => repo.path.toLowerCase() === repoPath.toLowerCase())) continue
      repos.push({ path: repoPath, username })
      if (repos.length >= 200) break
    }
  }
  return { accounts, defaultUsername, repos }
}
