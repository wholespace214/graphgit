import type { FileChange, RepoSnapshot, Result } from './types'

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
  commit: (repoPath: string, message: string) => Promise<Result<string>>
  checkout: (repoPath: string, name: string) => Promise<Result<string>>
  createBranch: (repoPath: string, name: string) => Promise<Result<string>>
  deleteBranch: (repoPath: string, name: string, force: boolean) => Promise<Result<string>>
  cloneRepo: (url: string, parentDir: string, folderName: string) => Promise<Result<string>>
  pull: (repoPath: string) => Promise<Result<string>>
  push: (repoPath: string) => Promise<Result<string>>
  fetch: (repoPath: string) => Promise<Result<string>>
  initRepo: (repoPath: string) => Promise<Result<string>>
  copyText: (text: string) => Promise<boolean>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximized: (cb: (maximized: boolean) => void) => () => void
}
