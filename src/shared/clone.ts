export function folderNameFromCloneUrl(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, '')
  const withoutGit = trimmed.replace(/\.git$/i, '')
  const slash = Math.max(withoutGit.lastIndexOf('/'), withoutGit.lastIndexOf('\\'), withoutGit.lastIndexOf(':'))
  const name = (slash === -1 ? withoutGit : withoutGit.slice(slash + 1)).trim()
  const cleaned = name.replace(/[<>:"|?*]/g, '').replace(/^\.+/, '')
  return cleaned.slice(0, 120) || 'repository'
}

export function cloneUrlError(url: string): string | null {
  const value = url.trim()
  if (!value) return 'Enter a repository URL'
  if (value.length > 2048 || value.startsWith('-') || /[\0\r\n]/.test(value)) return 'That URL cannot be cloned'
  return null
}

export function folderNameError(name: string): string | null {
  const value = name.trim()
  if (!value) return 'Enter a folder name'
  if (value !== name || value.length > 120) return 'Invalid folder name'
  if (value === '.' || value === '..' || /[<>:"|?*\\/]/.test(value) || value.endsWith('.')) {
    return 'Invalid folder name'
  }
  return null
}
