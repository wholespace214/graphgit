export const THEME_COLOR_KEYS = [
  'bg',
  'bgRaised',
  'bgOverlay',
  'bgChrome',
  'bgDetail',
  'bgComposer',
  'bgModal',
  'line',
  'lineStrong',
  'text',
  'muted',
  'accent',
  'accentInk',
  'accentSoft',
  'accentText',
  'selection',
  'scrollbar',
  'focus',
  'link',
  'okBg',
  'okText',
  'errBg',
  'errText',
  'warnBg',
  'warnText',
  'infoBg',
  'infoText',
  'tagBg',
  'tagText',
  'hover',
  'row',
  'rowOn',
  'selected',
  'current',
  'currentText',
  'pillBg',
  'pillText',
  'diffAddBg',
  'diffAddText',
  'diffDelBg',
  'diffDelText',
  'diffHunkBg',
  'diffHunkText',
  'diffMeta',
  'diffText',
  'badgeMod',
  'badgeModBg',
  'badgeAdd',
  'badgeAddBg',
  'badgeDel',
  'badgeDelBg',
  'badgeRen',
  'badgeRenBg',
  'backdrop',
  'glow',
] as const

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type ThemeColors = Record<ThemeColorKey, string>
export type ColorScheme = 'light' | 'dark'
export type BuiltinId = 'dark' | 'light' | 'dim' | 'contrast'

export type CustomTheme = {
  name: string
  scheme: ColorScheme
  colors: ThemeColors
}

export type SavedTheme = {
  selected: BuiltinId | 'custom'
  custom: CustomTheme | null
}

export type ThemeOption = {
  id: BuiltinId
  name: string
  description: string
  scheme: ColorScheme
  colors: ThemeColors
}

const CSS_VARS: Record<ThemeColorKey, string> = {
  bg: '--bg',
  bgRaised: '--bg-raised',
  bgOverlay: '--bg-overlay',
  bgChrome: '--bg-chrome',
  bgDetail: '--bg-detail',
  bgComposer: '--bg-composer',
  bgModal: '--bg-modal',
  line: '--line',
  lineStrong: '--line-strong',
  text: '--text',
  muted: '--muted',
  accent: '--accent',
  accentInk: '--accent-ink',
  accentSoft: '--accent-soft',
  accentText: '--accent-text',
  selection: '--selection',
  scrollbar: '--scrollbar',
  focus: '--focus',
  link: '--link',
  okBg: '--ok-bg',
  okText: '--ok-text',
  errBg: '--err-bg',
  errText: '--err-text',
  warnBg: '--warn-bg',
  warnText: '--warn-text',
  infoBg: '--info-bg',
  infoText: '--info-text',
  tagBg: '--tag-bg',
  tagText: '--tag-text',
  hover: '--hover',
  row: '--row',
  rowOn: '--row-on',
  selected: '--selected',
  current: '--current',
  currentText: '--current-text',
  pillBg: '--pill-bg',
  pillText: '--pill-text',
  diffAddBg: '--diff-add-bg',
  diffAddText: '--diff-add-text',
  diffDelBg: '--diff-del-bg',
  diffDelText: '--diff-del-text',
  diffHunkBg: '--diff-hunk-bg',
  diffHunkText: '--diff-hunk-text',
  diffMeta: '--diff-meta',
  diffText: '--diff-text',
  badgeMod: '--badge-mod',
  badgeModBg: '--badge-mod-bg',
  badgeAdd: '--badge-add',
  badgeAddBg: '--badge-add-bg',
  badgeDel: '--badge-del',
  badgeDelBg: '--badge-del-bg',
  badgeRen: '--badge-ren',
  badgeRenBg: '--badge-ren-bg',
  backdrop: '--backdrop',
  glow: '--glow',
}

const DARK: ThemeColors = {
  bg: '#0e1116',
  bgRaised: '#141a22',
  bgOverlay: '#1b2330',
  bgChrome: '#10151c',
  bgDetail: '#121820',
  bgComposer: '#10151c',
  bgModal: '#171e28',
  line: '#2a3442',
  lineStrong: '#3d4c60',
  text: '#e7edf5',
  muted: '#8b97a8',
  accent: '#3ee0a2',
  accentInk: '#06281c',
  accentSoft: '#17382c',
  accentText: '#8ff0c6',
  selection: '#1f6b4a',
  scrollbar: '#314052',
  focus: '#1f8f64',
  link: '#9ecbff',
  okBg: '#13281f',
  okText: '#b6f3d8',
  errBg: '#2a1618',
  errText: '#ffc1c1',
  warnBg: '#332416',
  warnText: '#ffd0a8',
  infoBg: '#1c2836',
  infoText: '#9ecbff',
  tagBg: '#2a2416',
  tagText: '#f0c14a',
  hover: '#182230',
  row: '#202a38',
  rowOn: '#1c2836',
  selected: '#15261f',
  current: '#17261f',
  currentText: '#d9fff0',
  pillBg: '#1c2430',
  pillText: '#c5d0de',
  diffAddBg: 'rgba(62, 224, 162, 0.12)',
  diffAddText: '#b8f5dc',
  diffDelBg: 'rgba(255, 123, 114, 0.12)',
  diffDelText: '#ffc7c3',
  diffHunkBg: '#17202b',
  diffHunkText: '#8eb7ff',
  diffMeta: '#8b97a8',
  diffText: '#d5dbe6',
  badgeMod: '#f0c14a',
  badgeModBg: '#2d2612',
  badgeAdd: '#3ee0a2',
  badgeAddBg: '#13281f',
  badgeDel: '#ff7b72',
  badgeDelBg: '#2a1618',
  badgeRen: '#c792ea',
  badgeRenBg: '#261b30',
  backdrop: 'rgba(6, 8, 12, 0.62)',
  glow: 'rgba(62, 224, 162, 0.08)',
}

const LIGHT: ThemeColors = {
  bg: '#f3f6f8',
  bgRaised: '#ffffff',
  bgOverlay: '#e6edf3',
  bgChrome: '#ffffff',
  bgDetail: '#f7fafc',
  bgComposer: '#ffffff',
  bgModal: '#ffffff',
  line: '#d5dee7',
  lineStrong: '#b7c4d2',
  text: '#1a2330',
  muted: '#5c6b7c',
  accent: '#0e9a68',
  accentInk: '#ffffff',
  accentSoft: '#e3f6ee',
  accentText: '#0b6a46',
  selection: '#b7ead6',
  scrollbar: '#c5d0db',
  focus: '#0e9a68',
  link: '#1a62b5',
  okBg: '#e5f6ee',
  okText: '#0d6844',
  errBg: '#fdecec',
  errText: '#9d2c2c',
  warnBg: '#fff1e4',
  warnText: '#8a4b12',
  infoBg: '#e7f1fb',
  infoText: '#1a4f86',
  tagBg: '#fff6dc',
  tagText: '#8a6408',
  hover: '#e8eef4',
  row: '#e8eef4',
  rowOn: '#dce8f4',
  selected: '#e3f6ee',
  current: '#dff5ec',
  currentText: '#0d3d2c',
  pillBg: '#e8eef4',
  pillText: '#314255',
  diffAddBg: 'rgba(14, 154, 104, 0.14)',
  diffAddText: '#0b6a46',
  diffDelBg: 'rgba(196, 62, 54, 0.12)',
  diffDelText: '#9d2c2c',
  diffHunkBg: '#e7f0fa',
  diffHunkText: '#1a4f86',
  diffMeta: '#5c6b7c',
  diffText: '#1a2330',
  badgeMod: '#8a6408',
  badgeModBg: '#fff3d0',
  badgeAdd: '#0b6a46',
  badgeAddBg: '#e3f6ee',
  badgeDel: '#9d2c2c',
  badgeDelBg: '#fdecec',
  badgeRen: '#6d3d92',
  badgeRenBg: '#f3e8fa',
  backdrop: 'rgba(20, 28, 38, 0.4)',
  glow: 'rgba(14, 154, 104, 0.12)',
}

const DIM: ThemeColors = {
  ...DARK,
  bg: '#1c212b',
  bgRaised: '#262c38',
  bgOverlay: '#313846',
  bgChrome: '#222833',
  bgDetail: '#232a36',
  bgComposer: '#222833',
  bgModal: '#2a3140',
  line: '#3d4758',
  lineStrong: '#526078',
  text: '#e4eaf2',
  muted: '#a3b0c2',
  accent: '#6ddec0',
  accentInk: '#06281c',
  accentSoft: '#1d3d36',
  accentText: '#b6f3e0',
  selection: '#2a6b56',
  scrollbar: '#4a5668',
  focus: '#3dbe9a',
  hover: '#343d4d',
  row: '#3a4454',
  rowOn: '#31404a',
  selected: '#243830',
  current: '#24362f',
  currentText: '#e5fff4',
  pillBg: '#313846',
  pillText: '#d5deea',
  glow: 'rgba(109, 222, 192, 0.1)',
}

const CONTRAST: ThemeColors = {
  ...DARK,
  bg: '#000000',
  bgRaised: '#000000',
  bgOverlay: '#141414',
  bgChrome: '#000000',
  bgDetail: '#000000',
  bgComposer: '#000000',
  bgModal: '#000000',
  line: '#ffffff',
  lineStrong: '#ffffff',
  text: '#ffffff',
  muted: '#e8e8e8',
  accent: '#3dffb0',
  accentInk: '#00150c',
  accentSoft: '#003322',
  accentText: '#b8ffdf',
  selection: '#006644',
  scrollbar: '#ffffff',
  focus: '#3dffb0',
  link: '#9fd4ff',
  okBg: '#003322',
  okText: '#b8ffdf',
  errBg: '#330000',
  errText: '#ffd0d0',
  warnBg: '#332200',
  warnText: '#ffe0b0',
  infoBg: '#001a33',
  infoText: '#c5e4ff',
  tagBg: '#332b00',
  tagText: '#ffe08a',
  hover: '#1a1a1a',
  row: '#1a1a1a',
  rowOn: '#003322',
  selected: '#003322',
  current: '#003322',
  currentText: '#ffffff',
  pillBg: '#000000',
  pillText: '#ffffff',
  diffAddBg: '#003322',
  diffAddText: '#b8ffdf',
  diffDelBg: '#330000',
  diffDelText: '#ffd0d0',
  diffHunkBg: '#001a33',
  diffHunkText: '#c5e4ff',
  diffMeta: '#e8e8e8',
  diffText: '#ffffff',
  badgeMod: '#ffe08a',
  badgeModBg: '#332b00',
  badgeAdd: '#3dffb0',
  badgeAddBg: '#003322',
  badgeDel: '#ff8a82',
  badgeDelBg: '#330000',
  badgeRen: '#e0b0ff',
  badgeRenBg: '#241433',
  backdrop: 'rgba(0, 0, 0, 0.78)',
  glow: 'rgba(61, 255, 176, 0.14)',
}

export const THEMES: ThemeOption[] = [
  { id: 'dark', name: 'Dark', description: 'The standard GraphGit look', scheme: 'dark', colors: DARK },
  { id: 'light', name: 'Light', description: 'A light background for bright rooms', scheme: 'light', colors: LIGHT },
  { id: 'dim', name: 'Dim', description: 'A softer dark background', scheme: 'dark', colors: DIM },
  { id: 'contrast', name: 'Contrast', description: 'Black, white, and a strong green', scheme: 'dark', colors: CONTRAST },
]

const THEME_KEY = 'graphgit.theme'
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+\s*)?\))$/i

export const THEME_SAMPLE = `{
  "name": "Ocean",
  "colorScheme": "dark",
  "colors": {
    "bg": "#0b1c24",
    "bgRaised": "#102833",
    "text": "#e7f4f6",
    "accent": "#4fd1c5",
    "accentInk": "#04221f"
  }
}`

export function readSaved(): SavedTheme {
  const fallback: SavedTheme = { selected: 'dark', custom: null }
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (!raw) return fallback
    const value = JSON.parse(raw) as Partial<SavedTheme>
    const selected = value.selected
    const builtin = selected === 'light' || selected === 'dim' || selected === 'contrast' || selected === 'dark' || selected === 'custom'
    const custom = value.custom && isCustom(value.custom) ? value.custom : null
    const next: SavedTheme = {
      selected: builtin ? selected : 'dark',
      custom,
    }
    if (next.selected === 'custom' && !next.custom) next.selected = 'dark'
    return next
  } catch {
    return fallback
  }
}

export function activeTheme(saved: SavedTheme): { name: string; scheme: ColorScheme; colors: ThemeColors } {
  if (saved.selected === 'custom' && saved.custom) return saved.custom
  return THEMES.find((theme) => theme.id === saved.selected) ?? THEMES[0]
}

export function applySaved(saved: SavedTheme): void {
  const theme = activeTheme(saved)
  const root = document.documentElement
  root.style.colorScheme = theme.scheme
  for (const key of THEME_COLOR_KEYS) root.style.setProperty(CSS_VARS[key], theme.colors[key])
  localStorage.setItem(THEME_KEY, JSON.stringify(saved))
}

export function parseThemeFile(text: string): { ok: true; theme: CustomTheme } | { ok: false; error: string } {
  if (text.length > 100_000) return { ok: false, error: 'That file is too large to be a theme.' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not JSON.' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'A theme file is a JSON object with a colors map.' }
  }
  const record = value as Record<string, unknown>
  const scheme = record.colorScheme === 'light' || record.scheme === 'light' ? 'light' : 'dark'
  const source = record.colors && typeof record.colors === 'object' && !Array.isArray(record.colors) ? (record.colors as Record<string, unknown>) : record
  const partial: Partial<ThemeColors> = {}
  let count = 0
  for (const key of THEME_COLOR_KEYS) {
    if (!(key in source)) continue
    const color = source[key]
    if (typeof color !== 'string' || !COLOR_VALUE.test(color.trim())) {
      return { ok: false, error: `${key} must be a color such as #1b2330 or rgb(20, 26, 34).` }
    }
    partial[key] = color.trim()
    count += 1
  }
  if (count === 0) return { ok: false, error: 'Add at least one color, such as bg or accent.' }
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 40) : 'Imported'
  const base = scheme === 'light' ? LIGHT : DARK
  return { ok: true, theme: { name, scheme, colors: { ...base, ...partial } } }
}

function isCustom(value: unknown): value is CustomTheme {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<CustomTheme>
  if (record.scheme !== 'light' && record.scheme !== 'dark') return false
  if (typeof record.name !== 'string' || !record.colors) return false
  return THEME_COLOR_KEYS.every((key) => typeof record.colors?.[key] === 'string')
}
