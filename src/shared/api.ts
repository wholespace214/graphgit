import type { Contributor, FileChange, PullMode, PullRequestList, RemoteTagList, RepoSnapshot, Result } from './types'

export type CommitFiles = {
  files: FileChange[]
  body: string
}

export type GraphGitApi = {
  pickRepo: (defaultPath?: string) => Promise<string | null>
  getInitialRepo: () => Promise<string | null>
  loadRepo: (repoPath: string) => Promise<Result<RepoSnapshot>>
  commitFiles: (repoPath: string, hash: string) => Promise<Result<CommitFiles>>
  commitDiff: (repoPath: string, hash: string, file: string) => Promise<Result<string>>
  workingDiff: (repoPath: string, file: string, staged: boolean) => Promise<Result<string>>
  stage: (repoPath: string, paths: string[]) => Promise<Result<string>>
  unstage: (repoPath: string, paths: string[]) => Promise<Result<string>>
  stageAll: (repoPath: string) => Promise<Result<string>>
  unstageAll: (repoPath: string) => Promise<Result<string>>
  commit: (repoPath: string, message: string, withUsers: Contributor[]) => Promise<Result<string>>
  checkout: (repoPath: string, name: string) => Promise<Result<string>>
  createBranch: (repoPath: string, name: string) => Promise<Result<string>>
  deleteBranch: (repoPath: string, name: string, force: boolean) => Promise<Result<string>>
  createTag: (repoPath: string, name: string, message: string) => Promise<Result<string>>
  deleteTag: (repoPath: string, name: string) => Promise<Result<string>>
  checkoutTag: (repoPath: string, name: string) => Promise<Result<string>>
  pushTag: (repoPath: string, name: string) => Promise<Result<string>>
  saveStash: (repoPath: string, message: string, includeUntracked: boolean) => Promise<Result<string>>
  applyStash: (repoPath: string, selector: string) => Promise<Result<string>>
  popStash: (repoPath: string, selector: string) => Promise<Result<string>>
  dropStash: (repoPath: string, selector: string) => Promise<Result<string>>
  stashDiff: (repoPath: string, selector: string) => Promise<Result<string>>
  listRemoteTags: (repoPath: string) => Promise<Result<RemoteTagList>>
  listPullRequests: (repoPath: string) => Promise<Result<PullRequestList>>
  checkoutPullRequest: (repoPath: string, number: number) => Promise<Result<string>>
  createPullRequest: (repoPath: string, title: string, base: string) => Promise<Result<string>>
  cloneRepo: (url: string, parentDir: string, folderName: string) => Promise<Result<string>>
  pull: (repoPath: string, mode?: PullMode) => Promise<Result<string>>
  push: (repoPath: string) => Promise<Result<string>>
  fetch: (repoPath: string) => Promise<Result<string>>
  fetchAll: (repoPath: string) => Promise<Result<string>>
  initRepo: (repoPath: string) => Promise<Result<string>>
  copyText: (text: string) => Promise<boolean>
  watchRepo: (repoPath: string, cb: () => void) => () => void
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximized: (cb: (maximized: boolean) => void) => () => void
}
