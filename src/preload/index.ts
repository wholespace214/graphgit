import { contextBridge, ipcRenderer } from 'electron'
import type { GraphGitApi } from '../shared/api'

const api: GraphGitApi = {
  pickRepo: (defaultPath) => ipcRenderer.invoke('repo:pick', defaultPath),
  getInitialRepo: () => ipcRenderer.invoke('repo:initial'),
  loadRepo: (repoPath) => ipcRenderer.invoke('repo:load', repoPath),
  commitFiles: (repoPath, hash) => ipcRenderer.invoke('repo:commit-files', repoPath, hash),
  commitDiff: (repoPath, hash, file) => ipcRenderer.invoke('repo:commit-diff', repoPath, hash, file),
  workingDiff: (repoPath, file, staged) => ipcRenderer.invoke('repo:working-diff', repoPath, file, staged),
  stage: (repoPath, paths) => ipcRenderer.invoke('repo:stage', repoPath, paths),
  unstage: (repoPath, paths) => ipcRenderer.invoke('repo:unstage', repoPath, paths),
  stageAll: (repoPath) => ipcRenderer.invoke('repo:stage-all', repoPath),
  unstageAll: (repoPath) => ipcRenderer.invoke('repo:unstage-all', repoPath),
  commit: (repoPath, message) => ipcRenderer.invoke('repo:commit', repoPath, message),
  checkout: (repoPath, name) => ipcRenderer.invoke('repo:checkout', repoPath, name),
  createBranch: (repoPath, name) => ipcRenderer.invoke('repo:create-branch', repoPath, name),
  deleteBranch: (repoPath, name, force) => ipcRenderer.invoke('repo:delete-branch', repoPath, name, force),
  cloneRepo: (url, parentDir, folderName) => ipcRenderer.invoke('repo:clone', url, parentDir, folderName),
  pull: (repoPath) => ipcRenderer.invoke('repo:pull', repoPath),
  push: (repoPath) => ipcRenderer.invoke('repo:push', repoPath),
  fetch: (repoPath) => ipcRenderer.invoke('repo:fetch', repoPath),
  initRepo: (repoPath) => ipcRenderer.invoke('repo:init', repoPath),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
}

contextBridge.exposeInMainWorld('graphgit', api)
