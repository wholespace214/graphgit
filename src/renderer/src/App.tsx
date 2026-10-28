import { useCallback, useEffect, useRef, useState } from 'react'
import type { Change, FileChange, RepoSnapshot } from '@shared/types'
import type { Result } from '@shared/types'
import { BranchList } from './components/BranchList'
import { BranchModal } from './components/BranchModal'
import { CloneModal } from './components/CloneModal'
import { CommitGraph } from './components/CommitGraph'
import { Composer } from './components/Composer'
import { Detail } from './components/Detail'
import { ProjectsPage } from './components/ProjectsPage'
import { Toolbar } from './components/Toolbar'
import { baseName } from './format'
import { forgetProject, readProjects, rememberProject, toggleFavorite, type Project } from './projects'

type Notice = { kind: 'ok' | 'err'; text: string }
type WorkSel = { path: string; staged: boolean }

const CLONE_PARENT = 'graphgit.cloneParent'

export function App() {
  const api = window.graphgit
  const [projects, setProjects] = useState<Project[]>([])
  const [page, setPage] = useState<'projects' | 'repo'>('projects')
  const [snap, setSnap] = useState<RepoSnapshot | null>(null)
  const [pendingInit, setPendingInit] = useState<string | null>(null)
  const [welcomeError, setWelcomeError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [query, setQuery] = useState('')
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [files, setFiles] = useState<FileChange[]>([])
  const [body, setBody] = useState('')
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [panel, setPanel] = useState<'commit' | 'work'>('commit')
  const [workSel, setWorkSel] = useState<WorkSel | null>(null)
  const [message, setMessage] = useState('')
  const [branchModal, setBranchModal] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneFolder, setCloneFolder] = useState('repository')
  const [cloneDest, setCloneDest] = useState('')
  const [cloneError, setCloneError] = useState<string | null>(null)

  const busyRef = useRef(false)
  const token = useRef(0)
  const snapRef = useRef(snap)
  const panelRef = useRef(panel)
  const workRef = useRef(workSel)
  const hashRef = useRef(selectedHash)
  const fileRef = useRef(activeFile)
  const autoOpened = useRef(false)
  snapRef.current = snap
  panelRef.current = panel
  workRef.current = workSel
  hashRef.current = selectedHash
  fileRef.current = activeFile

  const showError = useCallback((text: string) => {
    setNotice({ kind: 'err', text: text.slice(0, 4000) })
  }, [])
  const showOk = useCallback((text: string) => {
    setNotice({ kind: 'ok', text: text.slice(0, 4000) })
  }, [])

  const loadCommit = useCallback(
    async (repoPath: string, hash: string, file: string | null) => {
      const my = ++token.current
      setPanel('commit')
      setSelectedHash(hash)
      setDetailLoading(true)
      setDetailError(null)
      const meta = await api.commitFiles(repoPath, hash)
      if (my !== token.current) return
      if (!meta.ok) {
        setFiles([])
        setBody('')
        setDiffText('')
        setDetailError(meta.error)
        setDetailLoading(false)
        return
      }
      setFiles(meta.data.files)
      setBody(meta.data.body)
      const nextFile =
        file && meta.data.files.some((item) => item.path === file) ? file : (meta.data.files[0]?.path ?? null)
      setActiveFile(nextFile)
      if (!nextFile) {
        setDiffText('')
        setDetailLoading(false)
        return
      }
      const diff = await api.commitDiff(repoPath, hash, nextFile)
      if (my !== token.current) return
      setDiffText(diff.ok ? diff.data : '')
      setDetailError(diff.ok ? null : diff.error)
      setDetailLoading(false)
    },
    [api],
  )

  const openPath = useCallback(
    async (repoPath: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy('Opening repository')
      setWelcomeError(null)
      let loaded: RepoSnapshot | null = null
      try {
        const result = await api.loadRepo(repoPath)
        if (!result.ok) {
          if (result.code === 'NOT_A_REPO') {
            setNotice(null)
            setPendingInit(result.path ?? repoPath)
            setPage('projects')
            return
          }
          setWelcomeError(result.error)
          showError(result.error)
          return
        }
        loaded = result.data
        setPendingInit(null)
        setPage('repo')
        setSnap(result.data)
        setQuery('')
        setMessage('')
        setWorkSel(null)
        setProjects(rememberProject(result.data.path))
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error))
      } finally {
        busyRef.current = false
        setBusy(null)
      }
      if (!loaded) return
      const head = loaded.commits.find((commit) => commit.head) ?? loaded.commits[0]
      if (head) await loadCommit(loaded.path, head.hash, null)
      else {
        setSelectedHash(null)
        setFiles([])
        setBody('')
        setDiffText('')
        setPanel('commit')
      }
    },
    [api, loadCommit, showError],
  )

  const reload = useCallback(
    async (mode: 'keep' | 'head') => {
      const current = snapRef.current
      if (!current) return
      const result = await api.loadRepo(current.path)
      if (!result.ok) {
        showError(result.error)
        return
      }
      setSnap(result.data)
      if (mode === 'head') {
        setWorkSel(null)
        const head = result.data.commits.find((commit) => commit.head) ?? result.data.commits[0]
        if (head) await loadCommit(result.data.path, head.hash, null)
        else setSelectedHash(null)
        return
      }
      const selection = workRef.current
      if (panelRef.current === 'work' && selection) {
        const change = result.data.changes.find((item) => item.path === selection.path)
        if (change) {
          let staged = selection.staged
          if (staged && !change.staged && (change.unstaged || change.untracked)) staged = false
          if (!staged && !change.unstaged && !change.untracked && change.staged) staged = true
          const visible = staged ? change.staged : change.unstaged || change.untracked
          if (visible) {
            setWorkSel({ path: selection.path, staged })
            const my = ++token.current
            setDetailLoading(true)
            const diff = await api.workingDiff(result.data.path, selection.path, staged)
            if (my !== token.current) return
            setDiffText(diff.ok ? diff.data : '')
            setDetailError(diff.ok ? null : diff.error)
            setDetailLoading(false)
            return
          }
        }
        setWorkSel(null)
      }
      const hash = hashRef.current
      if (hash && result.data.commits.some((commit) => commit.hash === hash)) {
        await loadCommit(result.data.path, hash, fileRef.current)
        return
      }
      const head = result.data.commits.find((commit) => commit.head) ?? result.data.commits[0]
      if (head) await loadCommit(result.data.path, head.hash, null)
    },
    [api, loadCommit, showError],
  )

  const runAction = useCallback(
    async (label: string, action: () => Promise<Result<string>>, mode: 'keep' | 'head') => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(label)
      try {
        const result = await action()
        if (!result.ok) {
          showError(result.error)
          return
        }
        if (result.data) showOk(result.data)
        await reload(mode)
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error))
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    },
    [reload, showError, showOk],
  )

  const openDialog = useCallback(async () => {
    if (busyRef.current) return
    const picked = await api.pickRepo(snapRef.current?.path)
    if (picked) await openPath(picked)
  }, [api, openPath])

  const openClone = useCallback(() => {
    const current = snapRef.current?.path
    const saved = localStorage.getItem(CLONE_PARENT) || ''
    const parent = current ? current.replace(/[\\/][^\\/]+$/, '') : saved
    setCloneError(null)
    setCloneUrl('')
    setCloneFolder('repository')
    setCloneDest(parent)
    setCloneOpen(true)
  }, [])

  useEffect(() => {
    if (!api || autoOpened.current) return
    autoOpened.current = true
    setProjects(readProjects())
    void api.getInitialRepo().then((repoPath) => {
      if (repoPath) setProjects(rememberProject(repoPath))
    })
  }, [api])

  useEffect(() => {
    if (!notice || notice.kind !== 'ok') return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    document.title = page === 'repo' && snap ? `GraphGit — ${baseName(snap.path)}` : 'GraphGit'
  }, [page, snap])

  useEffect(() => {
    if (!branchModal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBranchModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [branchModal])

  async function selectFile(file: string) {
    const current = snapRef.current
    const hash = hashRef.current
    if (!current || !hash) return
    const my = ++token.current
    setActiveFile(file)
    setPanel('commit')
    setDetailLoading(true)
    const diff = await api.commitDiff(current.path, hash, file)
    if (my !== token.current) return
    setDiffText(diff.ok ? diff.data : '')
    setDetailError(diff.ok ? null : diff.error)
    setDetailLoading(false)
  }

  async function selectChange(change: Change, staged: boolean) {
    const current = snapRef.current
    if (!current) return
    const my = ++token.current
    setPanel('work')
    setWorkSel({ path: change.path, staged })
    setDetailLoading(true)
    setDetailError(null)
    const diff = await api.workingDiff(current.path, change.path, staged)
    if (my !== token.current) return
    setDiffText(diff.ok ? diff.data : '')
    setDetailError(diff.ok ? null : diff.error)
    setDetailLoading(false)
  }

  async function onCreateBranch() {
    const current = snapRef.current
    if (!current || busyRef.current) return
    const name = branchName.trim()
    if (!name) {
      setModalError('Enter a branch name')
      return
    }
    busyRef.current = true
    setBusy('Creating branch')
    try {
      const result = await api.createBranch(current.path, name)
      if (!result.ok) {
        setModalError(result.error)
        return
      }
      setBranchModal(false)
      setBranchName('')
      setModalError(null)
      showOk(result.data)
      await reload('head')
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function onDeleteBranch(name: string) {
    const current = snapRef.current
    if (!current || busyRef.current) return
    if (!window.confirm(`Delete local branch "${name}"?`)) return
    busyRef.current = true
    setBusy('Deleting branch')
    try {
      const result = await api.deleteBranch(current.path, name, false)
      if (!result.ok) {
        if (/not fully merged/i.test(result.error) && window.confirm(`${result.error}\n\nDelete it anyway?`)) {
          const forced = await api.deleteBranch(current.path, name, true)
          if (!forced.ok) {
            showError(forced.error)
            return
          }
          showOk(forced.data)
          await reload('keep')
          return
        }
        showError(result.error)
        return
      }
      showOk(result.data)
      await reload('keep')
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function onCloneSubmit() {
    if (busyRef.current) return
    const parent = cloneDest.trim()
    const folder = cloneFolder.trim()
    if (!cloneUrl.trim() || !parent || !folder) {
      setCloneError('Enter a URL, destination, and folder name')
      return
    }
    busyRef.current = true
    setBusy('Cloning')
    setCloneError(null)
    try {
      const result = await api.cloneRepo(cloneUrl.trim(), parent, folder)
      if (!result.ok) {
        setCloneError(result.error)
        return
      }
      localStorage.setItem(CLONE_PARENT, parent)
      setCloneOpen(false)
      showOk(`Cloned into ${result.data}`)
      busyRef.current = false
      setBusy(null)
      await openPath(result.data)
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : String(error))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function browseCloneDest() {
    const picked = await api.pickRepo(cloneDest || snapRef.current?.path)
    if (picked) setCloneDest(picked)
  }

  async function onNewRepo() {
    if (busyRef.current) return
    const picked = await api.pickRepo(snapRef.current?.path)
    if (!picked) return
    const result = await api.loadRepo(picked)
    if (result.ok) {
      await openPath(picked)
      return
    }
    if (!result.ok && result.code === 'NOT_A_REPO') {
      setNotice(null)
      setWelcomeError(null)
      setPendingInit(result.path ?? picked)
      setPage('projects')
      return
    }
    setWelcomeError(result.error)
    showError(result.error)
  }

  async function onInit() {
    if (!pendingInit || busyRef.current) return
    busyRef.current = true
    setBusy('Initializing repository')
    try {
      const result = await api.initRepo(pendingInit)
      if (!result.ok) {
        showError(result.error)
        return
      }
      showOk(result.data)
      const created = pendingInit
      busyRef.current = false
      setBusy(null)
      await openPath(created)
      return
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const selectedCommit = snap?.commits.find((commit) => commit.hash === selectedHash) ?? null
  const showRepo = page === 'repo' && snap

  return (
    <div className="app">
      {showRepo ? (
        <>
          <Toolbar
            path={snap.path}
            header={snap.header}
            remotes={snap.remotes}
            busy={busy}
            onProjects={() => setPage('projects')}
            onOpen={() => void openDialog()}
            onRefresh={() => void runAction('Refreshing', async () => ({ ok: true, data: 'Refreshed' }), 'keep')}
            onFetch={() => void runAction('Fetching', () => api.fetch(snap.path), 'keep')}
            onPull={() => void runAction('Pulling', () => api.pull(snap.path), 'head')}
            onPush={() => void runAction('Pushing', () => api.push(snap.path), 'keep')}
          />
          {busy && <div className="busy-line" />}
          {notice && (
            <div className={`notice ${notice.kind}`}>
              <span>{notice.text}</span>
              <button className="text-button" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          )}
          <div className="workspace">
            <aside className="sidebar">
              <BranchList
                branches={snap.branches}
                busy={Boolean(busy)}
                onCheckout={(name) => void runAction('Switching branch', () => api.checkout(snap.path, name), 'head')}
                onNewBranch={() => {
                  setModalError(null)
                  setBranchModal(true)
                }}
                onDelete={(name) => void onDeleteBranch(name)}
              />
            </aside>
            <CommitGraph
              commits={snap.commits}
              truncated={snap.truncated}
              query={query}
              selected={selectedHash}
              onQuery={setQuery}
              onSelect={(hash) => void loadCommit(snap.path, hash, null)}
            />
            <Detail
              panel={panel}
              loading={detailLoading}
              error={detailError}
              commit={selectedCommit}
              files={files}
              body={body}
              activeFile={activeFile}
              diff={diffText}
              workPath={workSel?.path ?? null}
              workStaged={workSel?.staged ?? false}
              onSelectFile={(file) => void selectFile(file)}
              onCopy={(text) => {
                void api.copyText(text).then((ok) => {
                  if (ok) showOk('Copied commit hash')
                })
              }}
            />
          </div>
          <Composer
            changes={snap.changes}
            message={message}
            busy={Boolean(busy)}
            selected={workSel}
            onMessage={setMessage}
            onCommit={() => {
              const text = message.trim()
              if (!text) return
              void runAction(
                'Committing',
                async () => {
                  const result = await api.commit(snap.path, text)
                  if (result.ok) setMessage('')
                  return result
                },
                'head',
              )
            }}
            onStage={(file) => void runAction('Staging', () => api.stage(snap.path, [file]), 'keep')}
            onUnstage={(file) => void runAction('Unstaging', () => api.unstage(snap.path, [file]), 'keep')}
            onStageAll={() => void runAction('Staging', () => api.stageAll(snap.path), 'keep')}
            onUnstageAll={() => void runAction('Unstaging', () => api.unstageAll(snap.path), 'keep')}
            onSelectChange={(change, staged) => void selectChange(change, staged)}
          />
          {branchModal && (
            <BranchModal
              name={branchName}
              error={modalError}
              busy={Boolean(busy)}
              onName={setBranchName}
              onClose={() => setBranchModal(false)}
              onSubmit={() => void onCreateBranch()}
            />
          )}
        </>
      ) : (
        <ProjectsPage
          projects={projects}
          error={welcomeError}
          busy={Boolean(busy)}
          pendingInit={pendingInit}
          initError={notice?.kind === 'err' ? notice.text : null}
          onOpen={() => void openDialog()}
          onClone={openClone}
          onNew={() => void onNewRepo()}
          onInit={() => void onInit()}
          onCancelInit={() => {
            setPendingInit(null)
            setNotice(null)
          }}
          onSelect={(repoPath) => void openPath(repoPath)}
          onToggleFavorite={(repoPath) => setProjects(toggleFavorite(repoPath))}
          onForget={(repoPath) => setProjects(forgetProject(repoPath))}
        />
      )}
      {cloneOpen && (
        <CloneModal
          url={cloneUrl}
          folder={cloneFolder}
          destination={cloneDest}
          error={cloneError}
          busy={Boolean(busy)}
          onUrl={setCloneUrl}
          onFolder={setCloneFolder}
          onDestination={setCloneDest}
          onBrowse={() => void browseCloneDest()}
          onClose={() => {
            if (!busy) setCloneOpen(false)
          }}
          onSubmit={() => void onCloneSubmit()}
        />
      )}
    </div>
  )
}
