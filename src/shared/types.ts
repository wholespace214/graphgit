export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'NOT_A_REPO' | 'NOT_FOUND'; path?: string }

export type BranchHeader = {
  name: string
  detached: boolean
  upstream?: string
  ahead: number
  behind: number
  gone: boolean
  empty: boolean
}

export type BranchInfo = {
  name: string
  hash: string
  current: boolean
  remote: boolean
  upstream?: string
}

export type RefChip = {
  kind: 'head' | 'branch' | 'remote' | 'tag'
  name: string
  current?: boolean
}

export type Commit = {
  hash: string
  parents: string[]
  author: string
  time: number
  subject: string
  refs: RefChip[]
  head: boolean
}

export type Change = {
  path: string
  oldPath?: string
  index: string
  workTree: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflict: boolean
}

export type FileChange = {
  status: string
  path: string
  oldPath?: string
}

export type RepoSnapshot = {
  path: string
  header: BranchHeader
  branches: BranchInfo[]
  tags: TagInfo[]
  commits: Commit[]
  changes: Change[]
  remotes: string[]
  truncated: boolean
}

export type TagInfo = {
  name: string
  commit: string
  annotated: boolean
}

export type PullRequest = {
  number: number
  title: string
  url: string
  head: string
  base: string
  author: string
}

export type PullRequestList = {
  requests: PullRequest[]
  detail: string | null
}
