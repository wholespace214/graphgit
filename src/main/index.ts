import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PullMode } from '../shared/types'
import {
  checkout,
  checkoutPullRequest,
  checkoutTag,
  cloneRepo,
  commit,
  commitDiff,
  commitFiles,
  createBranch,
  createPullRequest,
  createTag,
  deleteBranch,
  deleteTag,
  fetchAll,
  fetchRemote,
  initRepo,
  listPullRequests,
  listRemoteTags,
  loadRepo,
  pull,
  push,
  pushTag,
  applyStash,
  dropStash,
  popStash,
  saveStash,
  stashDiff,
  stage,
  stageAll,
  unstage,
  unstageAll,
  workingDiff,
} from './git'
import { watchRepo } from './watch'

const here = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null

function preloadScript(): string {
  const mjs = path.join(here, '../preload/index.mjs')
  const js = path.join(here, '../preload/index.js')
  return existsSync(mjs) ? mjs : js
}

async function waitForRenderer(url: string) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {
      // The dev server can start a moment after Electron.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

function appIcon(): string | undefined {
  const candidates = [path.join(here, '../../resources/icon.ico'), path.join(process.cwd(), 'resources/icon.ico')]
  return candidates.find((item) => existsSync(item))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 640,
    show: false,
    backgroundColor: '#0e1116',
    title: 'GraphGit',
    icon: appIcon(),
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadScript(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win
  win.removeMenu()
  const sendMaximized = (maximized: boolean) => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', maximized)
  }
  win.on('maximize', () => sendMaximized(true))
  win.on('unmaximize', () => sendMaximized(false))
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL?.replace('://localhost', '://127.0.0.1')
  if (!devUrl) {
    void win.loadFile(path.join(here, '../renderer/index.html'))
    return
  }

  let retries = 0
  win.webContents.on('did-fail-load', (_event, errorCode, _description, validatedURL, isMainFrame) => {
    if (!isMainFrame || retries >= 20) return
    if (errorCode === -102 || errorCode === -105) {
      retries += 1
      setTimeout(() => {
        if (!win.isDestroyed()) void win.loadURL(validatedURL)
      }, 300)
    }
  })

  void waitForRenderer(devUrl).then(() => {
    if (!win.isDestroyed()) void win.loadURL(devUrl)
  })
}

function pullMode(mode: unknown): PullMode {
  if (mode === 'ff' || mode === 'ff-only' || mode === 'rebase' || mode === 'default') return mode
  return 'default'
}

function handle<T>(channel: string, fn: (...args: unknown[]) => Promise<T>) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      console.error(channel, error)
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })
}

function registerIpc() {
  let repoWatch: { token: string; stop: () => void } | null = null
  let watchSeq = 0
  const hooked = new WeakSet<WebContents>()
  const stopWatch = (token?: string) => {
    if (token !== undefined && repoWatch?.token !== token) return
    repoWatch?.stop()
    repoWatch = null
  }
  ipcMain.handle('repo:watch', async (event, repoPath: unknown, token: unknown) => {
    const nextToken = String(token ?? '')
    const seq = ++watchSeq
    stopWatch()
    const watched = await watchRepo(String(repoPath ?? ''), () => {
      if (!event.sender.isDestroyed()) event.sender.send('repo:changed')
    })
    if (seq !== watchSeq) {
      watched.stop()
      return watched.root
    }
    repoWatch = { token: nextToken, stop: watched.stop }
    if (!hooked.has(event.sender)) {
      hooked.add(event.sender)
      event.sender.once('destroyed', () => {
        watchSeq += 1
        stopWatch()
      })
    }
    return watched.root
  })
  ipcMain.handle('repo:unwatch', (_event, token: unknown) => {
    watchSeq += 1
    stopWatch(String(token ?? ''))
  })
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:is-maximized', (event) => Boolean(BrowserWindow.fromWebContents(event.sender)?.isMaximized()))
  ipcMain.handle('repo:pick', async (event, defaultPath: unknown) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options = {
      title: 'Open a Git repository',
      properties: ['openDirectory'] as Array<'openDirectory'>,
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })
  ipcMain.handle('repo:initial', () => process.env.GRAPHGIT_REPO || null)
  ipcMain.handle('clipboard:write', (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 20_000) return false
    clipboard.writeText(text)
    return true
  })
  handle('repo:load', (repoPath) => loadRepo(String(repoPath ?? '')))
  handle('repo:commit-files', (repoPath, hash) => commitFiles(String(repoPath ?? ''), String(hash ?? '')))
  handle('repo:commit-diff', (repoPath, hash, file) =>
    commitDiff(String(repoPath ?? ''), String(hash ?? ''), String(file ?? '')),
  )
  handle('repo:working-diff', (repoPath, file, staged) =>
    workingDiff(String(repoPath ?? ''), String(file ?? ''), Boolean(staged)),
  )
  handle('repo:stage', (repoPath, paths) => stage(String(repoPath ?? ''), Array.isArray(paths) ? paths.map(String) : []))
  handle('repo:unstage', (repoPath, paths) => unstage(String(repoPath ?? ''), Array.isArray(paths) ? paths.map(String) : []))
  handle('repo:stage-all', (repoPath) => stageAll(String(repoPath ?? '')))
  handle('repo:unstage-all', (repoPath) => unstageAll(String(repoPath ?? '')))
  handle('repo:commit', (repoPath, message, withUsers) =>
    commit(String(repoPath ?? ''), String(message ?? ''), withUsers),
  )
  handle('repo:checkout', (repoPath, name) => checkout(String(repoPath ?? ''), String(name ?? '')))
  handle('repo:create-branch', (repoPath, name) => createBranch(String(repoPath ?? ''), String(name ?? '')))
  handle('repo:delete-branch', (repoPath, name, force) =>
    deleteBranch(String(repoPath ?? ''), String(name ?? ''), Boolean(force)),
  )
  handle('repo:create-tag', (repoPath, name, message) =>
    createTag(String(repoPath ?? ''), String(name ?? ''), String(message ?? '')),
  )
  handle('repo:delete-tag', (repoPath, name) => deleteTag(String(repoPath ?? ''), String(name ?? '')))
  handle('repo:checkout-tag', (repoPath, name) => checkoutTag(String(repoPath ?? ''), String(name ?? '')))
  handle('repo:push-tag', (repoPath, name) => pushTag(String(repoPath ?? ''), String(name ?? '')))
  handle('repo:stash-save', (repoPath, message, includeUntracked) =>
    saveStash(String(repoPath ?? ''), String(message ?? ''), includeUntracked === true),
  )
  handle('repo:stash-apply', (repoPath, selector) => applyStash(String(repoPath ?? ''), String(selector ?? '')))
  handle('repo:stash-pop', (repoPath, selector) => popStash(String(repoPath ?? ''), String(selector ?? '')))
  handle('repo:stash-drop', (repoPath, selector) => dropStash(String(repoPath ?? ''), String(selector ?? '')))
  handle('repo:stash-diff', (repoPath, selector) => stashDiff(String(repoPath ?? ''), String(selector ?? '')))
  handle('repo:remote-tags', (repoPath) => listRemoteTags(String(repoPath ?? '')))
  handle('repo:pull-requests', (repoPath) => listPullRequests(String(repoPath ?? '')))
  handle('repo:checkout-pr', (repoPath, number) => checkoutPullRequest(String(repoPath ?? ''), Number(number)))
  handle('repo:create-pr', (repoPath, title, base) =>
    createPullRequest(String(repoPath ?? ''), String(title ?? ''), String(base ?? '')),
  )
  handle('repo:clone', (url, parentDir, folderName) =>
    cloneRepo(String(url ?? ''), String(parentDir ?? ''), String(folderName ?? '')),
  )
  handle('repo:pull', (repoPath, mode) => pull(String(repoPath ?? ''), pullMode(mode)))
  handle('repo:push', (repoPath) => push(String(repoPath ?? '')))
  handle('repo:fetch', (repoPath) => fetchRemote(String(repoPath ?? '')))
  handle('repo:fetch-all', (repoPath) => fetchAll(String(repoPath ?? '')))
  handle('repo:init', (repoPath) => initRepo(String(repoPath ?? '')))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  registerIpc()
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  void app.whenReady().then(() => {
    app.setAppUserModelId('com.graphgit.app')
    Menu.setApplicationMenu(null)
    createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
