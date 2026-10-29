export type HistoryColumn = 'hash' | 'author' | 'when'

export type LayoutWidths = {
  side: number
  detail: number
  changes: number | null
  composer: number
  files: number
  hash: number
  author: number
  when: number
}

export const DEFAULT_LAYOUT: LayoutWidths = {
  side: 232,
  detail: 400,
  changes: null,
  composer: 300,
  files: 150,
  hash: 72,
  author: 130,
  when: 84,
}

export const HISTORY_COLUMNS: Record<HistoryColumn, { min: number; max: number; default: number }> = {
  hash: { min: 56, max: 220, default: DEFAULT_LAYOUT.hash },
  author: { min: 72, max: 320, default: DEFAULT_LAYOUT.author },
  when: { min: 64, max: 180, default: DEFAULT_LAYOUT.when },
}

export const SIDE_MIN = 180
export const SIDE_MAX = 480
export const DETAIL_MIN = 280
export const DETAIL_MAX = 760
export const GRAPH_MIN = 220
export const CHANGES_MIN = 240
export const MESSAGE_MIN = 280
export const COMPOSER_MIN = 200
export const COMPOSER_MAX = 720
export const HISTORY_MIN = 180
export const FILES_MIN = 72
export const FILES_MAX = 420

const LAYOUT_KEY = 'graphgit.layout'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function readLayout(): LayoutWidths {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const value = JSON.parse(raw) as Partial<LayoutWidths>
    const side = Number(value.side)
    const detail = Number(value.detail)
    const changes = value.changes == null ? null : Number(value.changes)
    const composer = Number(value.composer)
    const files = Number(value.files)
    const hash = Number(value.hash)
    const author = Number(value.author)
    const when = Number(value.when)
    return {
      side: Number.isFinite(side) ? clamp(side, SIDE_MIN, SIDE_MAX) : DEFAULT_LAYOUT.side,
      detail: Number.isFinite(detail) ? clamp(detail, DETAIL_MIN, DETAIL_MAX) : DEFAULT_LAYOUT.detail,
      changes: changes != null && Number.isFinite(changes) ? Math.max(CHANGES_MIN, changes) : null,
      composer: Number.isFinite(composer) ? clamp(composer, COMPOSER_MIN, COMPOSER_MAX) : DEFAULT_LAYOUT.composer,
      files: Number.isFinite(files) ? clamp(files, FILES_MIN, FILES_MAX) : DEFAULT_LAYOUT.files,
      hash: Number.isFinite(hash) ? clamp(hash, HISTORY_COLUMNS.hash.min, HISTORY_COLUMNS.hash.max) : DEFAULT_LAYOUT.hash,
      author: Number.isFinite(author) ? clamp(author, HISTORY_COLUMNS.author.min, HISTORY_COLUMNS.author.max) : DEFAULT_LAYOUT.author,
      when: Number.isFinite(when) ? clamp(when, HISTORY_COLUMNS.when.min, HISTORY_COLUMNS.when.max) : DEFAULT_LAYOUT.when,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(layout: LayoutWidths): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

/** Preferred widths, shrunk only for display when the window is too narrow. */
export function fitColumns(layout: LayoutWidths, width: number): { side: number; detail: number } {
  let side = clamp(layout.side, SIDE_MIN, SIDE_MAX)
  let detail = clamp(layout.detail, DETAIL_MIN, DETAIL_MAX)
  if (width <= 0) return { side, detail }
  const overflow = side + detail + GRAPH_MIN - width
  if (overflow > 0) {
    const fromDetail = Math.min(overflow, detail - DETAIL_MIN)
    detail -= fromDetail
    side = Math.max(SIDE_MIN, side - (overflow - fromDetail))
  }
  return { side, detail }
}

/** Preferred commit-area height, shrunk only for display when the window is too short. */
export function fitComposer(height: number, body: number): number {
  const preferred = Number.isFinite(height) ? height : DEFAULT_LAYOUT.composer
  const room = body > 0 ? body - HISTORY_MIN - 8 : COMPOSER_MAX
  return clamp(preferred, COMPOSER_MIN, Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, room)))
}
