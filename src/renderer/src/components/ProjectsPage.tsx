import { useMemo, useState } from 'react'
import { baseName, formatWhen } from '../format'
import type { Project } from '../projects'
import { Logo } from './Logo'
import { WindowControls } from './WindowControls'

export function ProjectsPage({
  projects,
  error,
  busy,
  pendingInit,
  initError,
  onOpen,
  onClone,
  onNew,
  onInit,
  onCancelInit,
  onSelect,
  onToggleFavorite,
  onForget,
}: {
  projects: Project[]
  error: string | null
  busy: boolean
  pendingInit: string | null
  initError: string | null
  onOpen: () => void
  onClone: () => void
  onNew: () => void
  onInit: () => void
  onCancelInit: () => void
  onSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
  onForget: (path: string) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () => (needle ? projects.filter((item) => `${baseName(item.path)} ${item.path}`.toLowerCase().includes(needle)) : projects),
    [needle, projects],
  )
  const favorites = visible.filter((item) => item.favorite)
  const recent = visible.filter((item) => !item.favorite)

  return (
    <div className="projects-page">
      <header className="toolbar">
        <div className="brand">
          <Logo size={18} />
          <span>GraphGit</span>
        </div>
        <span className="branch-pill">Projects</span>
        <div className="spacer" />
        {busy && <span className="busy-label">{busy}</span>}
        <WindowControls />
      </header>
      {busy && <div className="busy-line" />}
      <div className="projects-body">
        <aside className="projects-side">
          <h1>Projects</h1>
          <p>Choose a repository, or add one. Opening a project leaves this page and shows its history.</p>
          <button className="primary" onClick={onOpen} disabled={busy}>
            Open repository
          </button>
          <button className="ghost wide" onClick={onClone} disabled={busy}>
            Clone repository
          </button>
          <button className="ghost wide" onClick={onNew} disabled={busy}>
            New repository
          </button>
          {error && <p className="form-error">{error}</p>}
          {pendingInit && (
            <div className="init-card">
              <strong>Not a Git repository</strong>
              <span title={pendingInit}>{pendingInit}</span>
              <div className="welcome-actions">
                <button className="primary" onClick={onInit} disabled={busy}>
                  Initialize
                </button>
                <button className="ghost" onClick={onCancelInit} disabled={busy}>
                  Cancel
                </button>
              </div>
              {initError && <p className="form-error">{initError}</p>}
            </div>
          )}
        </aside>
        <main className="projects-main">
          <label className="projects-search">
            <input value={query} placeholder="Search projects" onChange={(event) => setQuery(event.target.value)} />
          </label>
          {projects.length === 0 && <p className="muted pad">No projects yet. Open, clone, or create a repository and it will be listed here.</p>}
          {projects.length > 0 && visible.length === 0 && <p className="muted pad">No projects match.</p>}
          {favorites.length > 0 && (
            <section>
              <h2>Favorites</h2>
              {favorites.map((project) => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  busy={busy}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  onForget={onForget}
                />
              ))}
            </section>
          )}
          {recent.length > 0 && (
            <section>
              <h2>Recent</h2>
              {recent.map((project) => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  busy={busy}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  onForget={onForget}
                />
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  busy,
  onSelect,
  onToggleFavorite,
  onForget,
}: {
  project: Project
  busy: boolean
  onSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
  onForget: (path: string) => void
}) {
  return (
    <div className="project-card">
      <button className="project-card-main" disabled={busy} title={project.path} onClick={() => onSelect(project.path)}>
        <strong>{baseName(project.path)}</strong>
        <span>{project.path}</span>
      </button>
      <span className="project-when">{formatWhen(Math.floor(project.openedAt / 1000))}</span>
      <button
        className={project.favorite ? 'icon-button on' : 'icon-button'}
        title={project.favorite ? 'Remove from favorites' : 'Favorite'}
        onClick={() => onToggleFavorite(project.path)}
      >
        ★
      </button>
      <button className="icon-button" title="Remove from the list. The folder stays on disk." onClick={() => onForget(project.path)}>
        ×
      </button>
    </div>
  )
}
