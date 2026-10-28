import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { repoWatchTargets } from './git'

const SKIP_DIR = new Set(['node_modules', 'out', 'dist', 'release', '.next', 'coverage', '.cache'])

const GIT_CHANGE =
  /^(HEAD|ORIG_HEAD|MERGE_HEAD|REBASE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|AUTO_MERGE|packed-refs|index|refs\/.*|logs\/.*|sequencer\/.*|worktrees\/.*)$/

export function ignoredWatchPath(filename: string, gitDir: boolean): boolean {
  const norm = filename.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!norm) return false
  if (norm.endsWith('.lock')) return true
  if (gitDir) return !GIT_CHANGE.test(norm)
  if (norm === '.git' || norm.startsWith('.git/')) return true
  return norm.split('/').some((part) => SKIP_DIR.has(part))
}

export type RepoWatch = {
  root: string
  stop: () => void
}

export async function watchRepo(repoPath: string, onChange: () => void): Promise<RepoWatch> {
  const { root, gitDirs } = await repoWatchTargets(repoPath)
  const watchers: FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const notify = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!stopped) onChange()
    }, 300)
  }

  const arm = (dir: string, gitDir: boolean) => {
    try {
      const recursive = process.platform === 'win32' || process.platform === 'darwin'
      const watcher = watch(dir, { recursive }, (_event, filename) => {
        if (ignoredWatchPath(filename?.toString() ?? '', gitDir)) return
        notify()
      })
      watcher.on('error', () => notify())
      watchers.push(watcher)
    } catch {
      // A missing directory should not stop the rest of the watch.
    }
  }

  arm(root, false)
  for (const dir of gitDirs) {
    if (path.resolve(dir) !== root) arm(dir, true)
  }

  const poll = setInterval(notify, 3000)

  return {
    root,
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      for (const watcher of watchers) watcher.close()
    },
  }
}
