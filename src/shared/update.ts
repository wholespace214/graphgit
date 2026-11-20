export type UpdateKind = 'auto' | 'dev' | 'portable'

export function updateKind(input: { packaged: boolean; platform: string; portable: boolean }): UpdateKind {
  if (!input.packaged) return 'dev'
  if (input.platform === 'win32' && input.portable) return 'portable'
  return 'auto'
}

export function disabledUpdateDetail(kind: Exclude<UpdateKind, 'auto'>): string {
  if (kind === 'dev') {
    return 'This development copy does not check for updates. An installed copy checks GitHub Releases on its own.'
  }
  return 'The portable build cannot replace itself. Download the newer portable file from GitHub Releases.'
}
