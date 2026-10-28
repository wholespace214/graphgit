import { useCallback, useEffect, useRef, useState } from 'react'
import type { Change, FileChange, PullRequest, RepoSnapshot } from '@shared/types'
import type { Result } from '@shared/types'
import { BranchModal } from './components/BranchModal'
import { CloneModal } from './components/CloneModal'
import { CommitGraph } from './components/CommitGraph'
import { Composer } from './components/Composer'
import { Detail } from './components/Detail'
import { ProjectsPage } from './components/ProjectsPage'
import { PullRequestModal } from './components/PullRequestModal'
import { RepoSide, type SideTab } from './components/RepoSide'
import { TagModal } from './components/TagModal'
import { Toolbar } from './components/Toolbar'
import { baseName } from './format'
import { forgetProject, readProjects, rememberProject, toggleFavorite, type Project } from './projects'

type Notice = { kind: 'ok' | 'err'; text: string }
type WorkSel = { path: string; staged: boolean }

const CLONE_PARENT = 'graphgit.cloneParent'

function repoSignature(snap: RepoSnapshot): string {
  const header = snap.header
  const commits = snap.commits
    .map((commit) => `${commit.hash}:${commit.head ? 1 : 0}:${commit.refs.map((ref) => `${ref.kind}:${ref.name}:${ref.current ? 1 : 0}`).join(',')}`)
    .join('\n')
  const branches = snap.branches
    .map((branch) => `${branch.remote ? 'r' : 'l'}:${branch.name}:${branch.hash}:${branch.current ? 1 : 0}:${branch.upstream ?? ''}`)
    .join('\n')
  const changes = snap.changes
    .map((change) => `${change.path}\t${change.oldPath ?? ''}\t${change.index}${change.workTree}\t${change.staged ? 1 : 0}${change.unstaged ? 1 : 0}${change.untracked ? 1 : 0}${change.conflict ? 1 : 0}`)
    .join('\n')
  return [
    snap.path,
    `${header.name}|${header.detached ? 1 : 0}|${header.upstream ?? ''}|${header.ahead}|${header.behind}|${header.gone ? 1 : 0}|${header.empty ? 1 : 0}`,
    snap.remotes.join('\n'),
    snap.truncated ? '1' : '0',
    snap.tags.map((tag) => `${tag.name}:${tag.commit}:${tag.annotated ? 1 : 0}`).join('\n'),
    commits,
    branches,
    changes,
  ].join('\n---\n')
}

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
  const [tagModal, setTagModal] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagMessage, setTagMessage] = useState('')
  const [prModal, setPrModal] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBase, setPrBase] = useState('main')
  const [modalError, setModalError] = useState<string | null>(null)
  const [side, setSide] = useState<SideTab>('branches')
  const [pulls, setPulls] = useState<PullRequest[]>([])
  const [pullDetail, setPullDetail] = useState<string | null>(null)
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
        setSide('branches')
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

  const liveGen = useRef(0)
  const liveRefresh = useCallback(async () => {
    const current = snapRef.current
    if (!current || busyRef.current) return
    const generation = ++liveGen.current
    const result = await api.loadRepo(current.path)
    if (generation !== liveGen.current || busyRef.current || snapRef.current?.path !== current.path) return
    if (!result.ok) return
    if (repoSignature(current) === repoSignature(result.data)) return
    setSnap(result.data)
    const selection = workRef.current
    if (panelRef.current === 'work' && selection) {
      const before = current.changes.find((item) => item.path === selection.path)
      const change = result.data.changes.find((item) => item.path === selection.path)
      if (!change) {
        setWorkSel(null)
        return
      }
      let staged = selection.staged
      if (staged && !change.staged && (change.unstaged || change.untracked)) staged = false
      if (!staged && !change.unstaged && !change.untracked && change.staged) staged = true
      const visible = staged ? change.staged : change.unstaged || change.untracked
      if (!visible) {
        setWorkSel(null)
        return
      }
      const beforeKey = before ? `${before.index}${before.workTree}${before.staged}${before.unstaged}${before.untracked}` : ''
      const afterKey = `${change.index}${change.workTree}${change.staged}${change.unstaged}${change.untracked}`
      if (beforeKey === afterKey && staged === selection.staged) return
      setWorkSel({ path: selection.path, staged })
      const my = ++token.current
      setDetailLoading(true)
      const diff = await api.workingDiff(result.data.path, selection.path, staged)
      if (my !== token.current || generation !== liveGen.current || busyRef.current) return
      setDiffText(diff.ok ? diff.data : '')
      setDetailError(diff.ok ? null : diff.error)
      setDetailLoading(false)
      return
    }
    const hash = hashRef.current
    if (hash && result.data.commits.some((commit) => commit.hash === hash)) return
    const head = result.data.commits.find((commit) => commit.head) ?? result.data.commits[0]
    if (head) await loadCommit(result.data.path, head.hash, null)
    else setSelectedHash(null)
  }, [api, loadCommit])

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
    if (page !== 'repo' || !snap?.path || !api.watchRepo) return
    let timer = 0
    let closed = false
    const schedule = () => {
      if (closed) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (closed) return
        if (busyRef.current) {
          schedule()
          return
        }
        void liveRefresh()
      }, 150)
    }
    const stop = api.watchRepo(snap.path, schedule)
    return () => {
      closed = true
      window.clearTimeout(timer)
      stop()
    }
  }, [api, liveRefresh, page, snap?.path])

  useEffect(() => {
    if (!branchModal && !tagModal && !prModal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setBranchModal(false)
      setTagModal(false)
      setPrModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [branchModal, tagModal, prModal])

  const loadPulls = useCallback(async () => {
    const current = snapRef.current
    if (!current) return
    const result = await api.listPullRequests(current.path)
    if (snapRef.current?.path !== current.path) return
    if (!result.ok) {
      setPulls([])
      setPullDetail(result.error)
      return
    }
    setPulls(result.data.requests)
    setPullDetail(result.data.detail)
  }, [api])

  useEffect(() => {
    if (page !== 'repo' || side !== 'pulls' || !snap?.path) return
    void loadPulls()
    const timer = window.setInterval(() => void loadPulls(), 20_000)
    return () => window.clearInterval(timer)
  }, [loadPulls, page, side, snap?.path])

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

  async function onCreateTag() {
    const current = snapRef.current
    if (!current || busyRef.current) return
    const name = tagName.trim()
    if (!name) {
      setModalError('Enter a tag name')
      return
    }
    busyRef.current = true
    setBusy('Creating tag')
    try {
      const result = await api.createTag(current.path, name, tagMessage)
      if (!result.ok) {
        setModalError(result.error)
        return
      }
      setTagModal(false)
      setTagName('')
      setTagMessage('')
      setModalError(null)
      showOk(result.data)
      await reload('keep')
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function onDeleteTag(name: string) {
    const current = snapRef.current
    if (!current || busyRef.current) return
    if (!window.confirm(`Delete tag "${name}"?`)) return
    await runAction('Deleting tag', () => api.deleteTag(current.path, name), 'keep')
  }

  async function onCreatePullRequest() {
    const current = snapRef.current
    if (!current || busyRef.current) return
    const title = prTitle.trim()
    const base = prBase.trim()
    if (!title || !base) {
      setModalError('Enter a title and a base branch')
      return
    }
    busyRef.current = true
    setBusy('Opening pull request')
    try {
      const result = await api.createPullRequest(current.path, title, base)
      if (!result.ok) {
        setModalError(result.error)
        return
      }
      setPrModal(false)
      setPrTitle('')
      setModalError(null)
      showOk(result.data)
      await loadPulls()
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
              <RepoSide
                tab={side}
                onTab={setSide}
                branches={snap.branches}
                tags={snap.tags ?? []}
                head={snap.commits.find((commit) => commit.head)?.hash ?? null}
                detached={snap.header.detached}
                pulls={pulls}
                pullDetail={pullDetail}
                busy={Boolean(busy)}
                canPush={snap.remotes.length > 0}
                onCheckout={(name) => void runAction('Switching branch', () => api.checkout(snap.path, name), 'head')}
                onNewBranch={() => {
                  setModalError(null)
                  setBranchModal(true)
                }}
                onDeleteBranch={(name) => void onDeleteBranch(name)}
                onCheckoutTag={(name) => void runAction('Checking out tag', () => api.checkoutTag(snap.path, name), 'head')}
                onNewTag={() => {
                  setModalError(null)
                  setTagModal(true)
                }}
                onDeleteTag={(name) => void onDeleteTag(name)}
                onPushTag={(name) => void runAction('Pushing tag', () => api.pushTag(snap.path, name), 'keep')}
                onCheckoutPull={(number) =>
                  void runAction('Checking out pull request', async () => {
                    const result = await api.checkoutPullRequest(snap.path, number)
                    if (result.ok) await loadPulls()
                    return result
                  }, 'head')
                }
                onNewPull={() => {
                  setModalError(null)
                  setPrBase('main')
                  setPrModal(true)
                }}
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
          {tagModal && (
            <TagModal
              name={tagName}
              message={tagMessage}
              error={modalError}
              busy={Boolean(busy)}
              onName={setTagName}
              onMessage={setTagMessage}
              onClose={() => setTagModal(false)}
              onSubmit={() => void onCreateTag()}
            />
          )}
          {prModal && (
            <PullRequestModal
              title={prTitle}
              base={prBase}
              error={modalError}
              busy={Boolean(busy)}
              onTitle={setPrTitle}
              onBase={setPrBase}
              onClose={() => setPrModal(false)}
              onSubmit={() => void onCreatePullRequest()}
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
