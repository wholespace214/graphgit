export type Project = {
  path: string
  favorite: boolean
  openedAt: number
}

const PROJECTS = 'graphgit.projects'
const RECENTS = 'graphgit.recents'
const LIMIT = 30

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Project>
  return typeof item.path === 'string' && typeof item.favorite === 'boolean' && typeof item.openedAt === 'number'
}

function write(projects: Project[]) {
  localStorage.setItem(PROJECTS, JSON.stringify(projects))
}

function samePath(left: string, right: string) {
  return left.replace(/[\\/]+$/, '').toLowerCase() === right.replace(/[\\/]+$/, '').toLowerCase()
}

export function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter(isProject).sort((a, b) => b.openedAt - a.openedAt).slice(0, LIMIT)
      }
    }
  } catch {
    return []
  }
  try {
    const old = JSON.parse(localStorage.getItem(RECENTS) || '[]') as unknown
    if (!Array.isArray(old)) return []
    const migrated = old
      .filter((item): item is string => typeof item === 'string')
      .slice(0, LIMIT)
      .map((path, index) => ({ path, favorite: false, openedAt: Date.now() - index }))
    if (migrated.length > 0) write(migrated)
    return migrated
  } catch {
    return []
  }
}

export function rememberProject(repoPath: string): Project[] {
  const current = readProjects()
  const previous = current.find((item) => samePath(item.path, repoPath))
  const next = [
    { path: repoPath, favorite: previous?.favorite ?? false, openedAt: Date.now() },
    ...current.filter((item) => !samePath(item.path, repoPath)),
  ].slice(0, LIMIT)
  write(next)
  return next
}

export function toggleFavorite(repoPath: string): Project[] {
  const next = readProjects().map((item) =>
    samePath(item.path, repoPath) ? { ...item, favorite: !item.favorite } : item,
  )
  write(next)
  return next
}

export function forgetProject(repoPath: string): Project[] {
  const next = readProjects().filter((item) => !samePath(item.path, repoPath))
  write(next)
  return next
}
