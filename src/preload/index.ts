import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
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
  commit: (repoPath, message, withUsers) => ipcRenderer.invoke('repo:commit', repoPath, message, withUsers),
  checkout: (repoPath, name) => ipcRenderer.invoke('repo:checkout', repoPath, name),
  createBranch: (repoPath, name) => ipcRenderer.invoke('repo:create-branch', repoPath, name),
  deleteBranch: (repoPath, name, force) => ipcRenderer.invoke('repo:delete-branch', repoPath, name, force),
  createTag: (repoPath, name, message) => ipcRenderer.invoke('repo:create-tag', repoPath, name, message),
  deleteTag: (repoPath, name) => ipcRenderer.invoke('repo:delete-tag', repoPath, name),
  checkoutTag: (repoPath, name) => ipcRenderer.invoke('repo:checkout-tag', repoPath, name),
  pushTag: (repoPath, name) => ipcRenderer.invoke('repo:push-tag', repoPath, name),
  saveStash: (repoPath, message, includeUntracked) => ipcRenderer.invoke('repo:stash-save', repoPath, message, includeUntracked),
  applyStash: (repoPath, selector) => ipcRenderer.invoke('repo:stash-apply', repoPath, selector),
  popStash: (repoPath, selector) => ipcRenderer.invoke('repo:stash-pop', repoPath, selector),
  dropStash: (repoPath, selector) => ipcRenderer.invoke('repo:stash-drop', repoPath, selector),
  stashDiff: (repoPath, selector) => ipcRenderer.invoke('repo:stash-diff', repoPath, selector),
  listRemoteTags: (repoPath) => ipcRenderer.invoke('repo:remote-tags', repoPath),
  listPullRequests: (repoPath) => ipcRenderer.invoke('repo:pull-requests', repoPath),
  checkoutPullRequest: (repoPath, number) => ipcRenderer.invoke('repo:checkout-pr', repoPath, number),
  createPullRequest: (repoPath, title, base) => ipcRenderer.invoke('repo:create-pr', repoPath, title, base),
  cloneRepo: (url, parentDir, folderName) => ipcRenderer.invoke('repo:clone', url, parentDir, folderName),
  pull: (repoPath, mode) => ipcRenderer.invoke('repo:pull', repoPath, mode ?? 'default'),
  push: (repoPath) => ipcRenderer.invoke('repo:push', repoPath),
  fetch: (repoPath) => ipcRenderer.invoke('repo:fetch', repoPath),
  fetchAll: (repoPath) => ipcRenderer.invoke('repo:fetch-all', repoPath),
  initRepo: (repoPath) => ipcRenderer.invoke('repo:init', repoPath),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  watchRepo: (repoPath, cb) => {
    const token = `${Date.now()}-${Math.random()}`
    const listener = () => cb()
    ipcRenderer.on('repo:changed', listener)
    void ipcRenderer.invoke('repo:watch', repoPath, token)
    return () => {
      ipcRenderer.removeListener('repo:changed', listener)
      void ipcRenderer.invoke('repo:unwatch', token)
    }
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximized: (cb) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean) => cb(Boolean(maximized))
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
}

contextBridge.exposeInMainWorld('graphgit', api)
