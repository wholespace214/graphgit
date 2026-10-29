import { useRef, useState } from 'react'
import { BackButton } from './BackButton'
import { SettingsButton } from './SettingsButton'
import { WindowControls } from './WindowControls'
import { Logo } from './Logo'
import {
  THEME_COLOR_KEYS,
  THEME_SAMPLE,
  THEMES,
  applySaved,
  parseThemeFile,
  readSaved,
  type SavedTheme,
} from '../theme'

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const [saved, setSaved] = useState<SavedTheme>(readSaved)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function choose(selected: SavedTheme['selected']) {
    if (selected === 'custom' && !saved.custom) return
    const next = { ...saved, selected }
    setSaved(next)
    applySaved(next)
    setError(null)
  }

  function removeCustom() {
    const next: SavedTheme = { selected: saved.selected === 'custom' ? 'dark' : saved.selected, custom: null }
    setSaved(next)
    applySaved(next)
    setError(null)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseThemeFile(String(reader.result ?? ''))
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      const next: SavedTheme = { selected: 'custom', custom: parsed.theme }
      setSaved(next)
      applySaved(next)
      setError(null)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  return (
    <div className="projects-page">
      <header className="chrome">
        <div className="chrome-title">
          <div className="brand">
            <Logo size={18} />
            <span>GraphGit</span>
          </div>
          <span className="branch-pill">Settings</span>
          <div className="spacer" />
          <SettingsButton active onClick={() => undefined} />
          <WindowControls />
        </div>
        <div className="chrome-actions">
          <BackButton onClick={onBack} label="Back" />
        </div>
      </header>
      <div className="settings-body">
        <h1>Appearance</h1>
        <p>Choose how GraphGit looks. The choice stays on this computer.</p>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              name={theme.name}
              description={theme.description}
              colors={theme.colors}
              selected={saved.selected === theme.id}
              onChoose={() => choose(theme.id)}
            />
          ))}
          {saved.custom && (
            <ThemeCard
              name={saved.custom.name}
              description="Imported from a JSON file"
              colors={saved.custom.colors}
              selected={saved.selected === 'custom'}
              onChoose={() => choose('custom')}
            />
          )}
        </div>
        <h2>Import a theme</h2>
        <p>A JSON file can replace the colors. Colors you leave out keep the Dark theme, or the Light theme when colorScheme is light.</p>
        <pre className="theme-sample">{THEME_SAMPLE}</pre>
        <p className="theme-keys">
          {THEME_COLOR_KEYS.map((key) => (
            <code key={key}>{key}</code>
          ))}
        </p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          {saved.custom && (
            <button className="ghost" onClick={removeCustom}>
              Remove imported theme
            </button>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <input
          ref={fileRef}
          className="theme-file"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            onFile(file)
          }}
        />
      </div>
    </div>
  )
}

function ThemeCard({
  name,
  description,
  colors,
  selected,
  onChoose,
}: {
  name: string
  description: string
  colors: { bg: string; bgRaised: string; accent: string; text: string; line: string }
  selected: boolean
  onChoose: () => void
}) {
  return (
    <button type="button" className={selected ? 'theme-card on' : 'theme-card'} aria-pressed={selected} onClick={onChoose}>
      <span className="theme-swatch" style={{ background: colors.bg, borderColor: colors.line }}>
        <span style={{ background: colors.bgRaised }} />
        <span style={{ background: colors.accent }} />
        <span style={{ background: colors.text }} />
      </span>
      <strong>{name}</strong>
      <span className="muted">{description}</span>
    </button>
  )
}
