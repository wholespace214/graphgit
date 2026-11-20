export type GitHubAccount = {
  username: string
  default: boolean
}

export type GitHubAccounts = {
  accounts: GitHubAccount[]
}

export type GitHubRepo = {
  name: string
  fullName: string
  private: boolean
  fork: boolean
  archived: boolean
  description: string
  updatedAt: string
  cloneUrl: string
}

export type GitHubRepoList = {
  repos: GitHubRepo[]
  truncated: boolean
}

const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

export function githubUsernameError(username: string): string | null {
  const name = username.trim()
  if (!name) return 'Enter a GitHub username.'
  if (!USERNAME.test(name)) return 'GitHub usernames use letters, numbers, and single hyphens.'
  return null
}

export function githubTokenError(token: string): string | null {
  const value = token.trim()
  if (!value) return 'Enter a personal access token.'
  if (value.length < 20 || value.length > 300 || /[\0-\x1f\x7f\s]/.test(value) || value.includes('://')) {
    return 'That token does not look like a GitHub personal access token.'
  }
  return null
}

export function redactSecret(text: string, secret: string): string {
  if (secret.length < 8 || !text.includes(secret)) return text
  return text.split(secret).join('[token]')
}
