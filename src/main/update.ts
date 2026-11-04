import { createRequire } from 'node:module'
import { app, BrowserWindow } from 'electron'
import type { AppUpdater } from 'electron-updater'
import { disabledUpdateDetail, updateKind, type UpdateKind } from '../shared/update'

const { autoUpdater } = createRequire(import.meta.url)('electron-updater') as { autoUpdater: AppUpdater }
import type { UpdatePhase, UpdateState } from '../shared/types'

const CHECK_DELAY_MS = 4_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let state: UpdateState | null = null
let wired = false
let installing = false

function kind(): UpdateKind {
  return updateKind({
    packaged: app.isPackaged,
    platform: process.platform,
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR),
  })
}

function createState(): UpdateState {
  const mode = kind()
  return {
    revision: 0,
    phase: mode === 'auto' ? 'idle' : 'disabled',
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    detail: mode === 'auto' ? null : disabledUpdateDetail(mode),
  }
}

function ensureState(): UpdateState {
  state ??= createState()
  return state
}

function publish(patch: { phase: UpdatePhase; availableVersion?: string | null; percent?: number | null; detail?: string | null }) {
  const current = ensureState()
  state = {
    revision: current.revision + 1,
    phase: patch.phase,
    currentVersion: app.getVersion(),
    availableVersion: patch.availableVersion === undefined ? current.availableVersion : patch.availableVersion,
    percent: patch.percent === undefined ? current.percent : patch.percent,
    detail: patch.detail === undefined ? current.detail : patch.detail,
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:changed', state)
  }
}

function cleanUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const line = message.split('\n')[0]?.trim() || 'Could not check for updates.'
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find .*ya?ml|No published versions/i.test(line)) {
    return 'No published update was found on GitHub Releases.'
  }
  return line.length > 300 ? `${line.slice(0, 297)}…` : line
}

function readyDetail(): string {
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'Restart to install it. The system will ask permission to update the package. Quitting also installs it.'
  }
  return 'Restart to install it. Quitting also installs it.'
}

function wireUpdater() {
  if (wired) return
  wired = true
  autoUpdater.logger = {
    info: (message?: unknown) => console.info(message),
    warn: (message?: unknown) => console.warn(message),
    error: (message?: unknown) => console.error(message),
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => {
    publish({ phase: 'checking', percent: null, detail: null })
  })
  autoUpdater.on('update-available', (info) => {
    publish({ phase: 'downloading', availableVersion: info.version, percent: 0, detail: null })
  })
  autoUpdater.on('update-not-available', () => {
    publish({ phase: 'current', availableVersion: null, percent: null, detail: null })
  })
  autoUpdater.on('download-progress', (progress) => {
    const percent = Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, Math.round(progress.percent))) : null
    publish({ phase: 'downloading', percent, detail: null })
  })
  autoUpdater.on('update-downloaded', (info) => {
    publish({ phase: 'ready', availableVersion: info.version, percent: 100, detail: readyDetail() })
  })
  autoUpdater.on('update-cancelled', () => {
    publish({ phase: 'idle', percent: null, detail: null })
  })
  autoUpdater.on('error', (error) => {
    if (ensureState().phase === 'ready') return
    publish({ phase: 'error', percent: null, detail: cleanUpdateError(error) })
  })
}

export function currentUpdateState(): UpdateState {
  return ensureState()
}

export function setupAutoUpdate() {
  ensureState()
  if (kind() !== 'auto') return
  wireUpdater()
  const first = setTimeout(() => void checkForUpdates(), CHECK_DELAY_MS)
  const later = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
  first.unref()
  later.unref()
}

export async function checkForUpdates(): Promise<UpdateState> {
  const current = ensureState()
  if (kind() !== 'auto') return current
  if (current.phase === 'downloading' || current.phase === 'ready') return current
  wireUpdater()
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result == null && state?.phase === 'checking') {
      publish({ phase: 'idle', percent: null, detail: null })
    }
  } catch (error) {
    if (state?.phase !== 'ready') publish({ phase: 'error', percent: null, detail: cleanUpdateError(error) })
  }
  return ensureState()
}

export function installDownloadedUpdate(): void {
  if (installing || ensureState().phase !== 'ready') return
  installing = true
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true)
  })
}
