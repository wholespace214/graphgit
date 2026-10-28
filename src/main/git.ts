import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { cloneUrlError, folderNameError } from '../shared/clone'
import type { BranchHeader, BranchInfo, Change, Commit, FileChange, RefChip, RepoSnapshot, Result } from '../shared/types'

const LOG_LIMIT = 500
const OUTPUT_CAP = 500_000
const DIFF_CAP = 300_000

export class GitCommandError extends Error {
  code?: 'NOT_A_REPO' | 'NOT_FOUND'
  path?: string

  constructor(message: string, code?: 'NOT_A_REPO' | 'NOT_FOUND', path?: string) {
    super(message)
    this.name = 'GitCommandError'
    this.code = code
    this.path = path
  }
}

function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn().then(
    (data) => ({ ok: true, data }),
    (error: unknown) => {
      if (error instanceof GitCommandError) {
        return { ok: false, error: error.message, code: error.code, path: error.path }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    },
  )
}

function gitMessage(stderr: string, stdout: string): string {
  const text = (stderr || stdout || 'Git command failed').trim()
  const hint = /please tell me who you are|author identity unknown/i.test(text)
    ? '\n\nGit needs user.name and user.email before it can commit. Set them in your Git config, then try again.'
    : ''
  return (text + hint).slice(0, 4000)
}

function capText(text: string): string {
  if (text.length <= DIFF_CAP) return text
  return `${text.slice(0, DIFF_CAP)}\n\n… Diff truncated …`
}

function outputText(result: { stdout: string; stderr: string }): string {
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n') || 'Done'
}

type RunOptions = {
  stdin?: string
  check?: boolean
  timeoutMs?: number
}

function runGit(
  repo: string,
  args: string[],
  options?: RunOptions,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = options?.timeoutMs ?? 30_000
  return new Promise((resolve, reject) => {
    let settled = false
    let timedOut = false
    const child = spawn(
      'git',
      [
        '--no-pager',
        '-c',
        'core.quotepath=false',
        '-c',
        'color.ui=never',
        '-c',
        'i18n.logOutputEncoding=utf-8',
        '-c',
        'core.editor=true',
        ...args,
      ],
      {
        cwd: repo,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_EDITOR: 'true',
          EDITOR: 'true',
        },
      },
    )

    const out: Buffer[] = []
    const err: Buffer[] = []
    let outSize = 0
    let errSize = 0
    let truncated = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      outSize += chunk.length
      if (outSize <= OUTPUT_CAP) out.push(chunk)
      else truncated = true
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      errSize += chunk.length
      if (errSize <= OUTPUT_CAP) err.push(chunk)
      else truncated = true
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(() => {
        const missing = error.code === 'ENOENT'
        reject(new GitCommandError(missing ? 'Git is not installed or not on your PATH.' : error.message))
      })
    })

    child.on('close', (code) => {
      finish(() => {
        if (timedOut) {
          reject(new GitCommandError('Git took too long and was stopped.'))
          return
        }
        let stdout = Buffer.concat(out).toString('utf8')
        const stderr = Buffer.concat(err).toString('utf8')
        if (truncated && outSize > OUTPUT_CAP) stdout += '\n\n… Output truncated …'
        const finalCode = code ?? 1
        if (options?.check && finalCode !== 0) {
          reject(new GitCommandError(gitMessage(stderr, stdout)))
          return
        }
        resolve({ code: finalCode, stdout, stderr })
      })
    })

    try {
      if (options?.stdin !== undefined) child.stdin?.end(Buffer.from(options.stdin, 'utf8'))
      else child.stdin?.end()
    } catch {
      // stdin can already be closed if git failed to start
    }
  })
}

export function parseDecoration(decoration: string): RefChip[] {
  if (!decoration.trim()) return []
  const chips: RefChip[] = []
  for (const part of decoration.split(', ')) {
    if (!part || part.endsWith('/HEAD')) continue
    if (part === 'HEAD') {
      chips.push({ kind: 'head', name: 'detached' })
      continue
    }
    if (part.startsWith('HEAD -> ')) {
      chips.push({ kind: 'branch', name: part.slice('HEAD -> '.length), current: true })
      continue
    }
    if (part.startsWith('tag: ')) {
      chips.push({ kind: 'tag', name: part.slice(5) })
      continue
    }
    if (part.includes('/')) chips.push({ kind: 'remote', name: part })
    else chips.push({ kind: 'branch', name: part })
  }
  return chips
}

export function parseBranchHeader(line: string): BranchHeader {
  let raw = line.startsWith('## ') ? line.slice(3) : line
  let ahead = 0
  let behind = 0
  let gone = false
  const bracket = raw.match(/ \[([^\]]+)\]$/)
  if (bracket && bracket.index !== undefined) {
    raw = raw.slice(0, bracket.index)
    const inside = bracket[1] ?? ''
    gone = inside === 'gone'
    const aheadMatch = inside.match(/ahead (\d+)/)
    const behindMatch = inside.match(/behind (\d+)/)
    if (aheadMatch) ahead = Number(aheadMatch[1])
    if (behindMatch) behind = Number(behindMatch[1])
  }
  if (raw.startsWith('No commits yet on ')) {
    return { name: raw.slice('No commits yet on '.length), detached: false, ahead, behind, gone, empty: true }
  }
  if (raw === 'HEAD (no branch)') {
    return { name: 'HEAD', detached: true, ahead, behind, gone, empty: false }
  }
  const splitAt = raw.indexOf('...')
  const name = (splitAt === -1 ? raw : raw.slice(0, splitAt)) || 'HEAD'
  const upstream = splitAt === -1 ? undefined : raw.slice(splitAt + 3) || undefined
  return { name, detached: false, upstream, ahead, behind, gone, empty: false }
}

export function parseStatus(stdout: string): { header: BranchHeader; changes: Change[] } {
  const parts = stdout.split('\0').filter((part) => part.length > 0)
  let header: BranchHeader = {
    name: 'HEAD',
    detached: true,
    ahead: 0,
    behind: 0,
    gone: false,
    empty: false,
  }
  let start = 0
  if (parts[0]?.startsWith('##')) {
    header = parseBranchHeader(parts[0])
    start = 1
  }
  const changes: Change[] = []
  for (let index = start; index < parts.length; index++) {
    const entry = parts[index] ?? ''
    if (entry.length < 3) continue
    const indexStatus = entry[0] ?? ' '
    const workTree = entry[1] ?? ' '
    let filePath = entry.slice(3)
    let oldPath: string | undefined
    if (indexStatus === 'R' || indexStatus === 'C') {
      oldPath = filePath
      filePath = parts[++index] ?? filePath
    }
    const untracked = indexStatus === '?' && workTree === '?'
    const conflict =
      indexStatus === 'U' ||
      workTree === 'U' ||
      (indexStatus === 'A' && workTree === 'A') ||
      (indexStatus === 'D' && workTree === 'D')
    changes.push({
      path: filePath,
      oldPath,
      index: indexStatus,
      workTree,
      staged: !untracked && indexStatus !== ' ' && indexStatus !== '?',
      unstaged: untracked || (workTree !== ' ' && workTree !== '?'),
      untracked,
      conflict,
    })
  }
  return { header, changes }
}

export function parseLog(stdout: string): Commit[] {
  const commits: Commit[] = []
  for (const raw of stdout.split('\x1e')) {
    const record = raw.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    if (!record.trim()) continue
    const [hash, parents, author, at, decoration, subject] = record.split('\x1f')
    if (!hash || !/^[0-9a-f]{40}$/i.test(hash)) continue
    const deco = decoration ?? ''
    commits.push({
      hash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      author: author ?? '',
      time: Number(at) || 0,
      subject: subject ?? '',
      refs: parseDecoration(deco),
      head: deco.split(', ').some((part) => part === 'HEAD' || part.startsWith('HEAD -> ')),
    })
  }
  return commits
}

export function parseBranches(stdout: string): BranchInfo[] {
  const branches: BranchInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [refname, hash, head, upstream] = line.split('\t')
    if (!refname || !hash) continue
    let name = ''
    let remote = false
    if (refname.startsWith('refs/heads/')) name = refname.slice('refs/heads/'.length)
    else if (refname.startsWith('refs/remotes/')) {
      name = refname.slice('refs/remotes/'.length)
      if (name.endsWith('/HEAD')) continue
      remote = true
    } else continue
    branches.push({
      name,
      hash,
      current: head === '*',
      remote,
      upstream: upstream || undefined,
    })
  }
  return branches
}

export function parseNameStatusZ(stdout: string): FileChange[] {
  const parts = stdout
    .replace(/^\s+/, '')
    .split('\0')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const files: FileChange[] = []
  for (let index = 0; index < parts.length; ) {
    const status = parts[index++]
    if (!status) break
    if (status[0] === 'R' || status[0] === 'C') {
      const oldPath = parts[index++]
      const filePath = parts[index++]
      if (oldPath && filePath) files.push({ status, path: filePath, oldPath })
    } else {
      const filePath = parts[index++]
      if (filePath) files.push({ status, path: filePath })
    }
  }
  return files
}

function assertDirectory(repoPath: string): string {
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    throw new GitCommandError('Missing folder')
  }
  const resolved = path.resolve(repoPath)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new GitCommandError('Folder does not exist', 'NOT_FOUND', resolved)
  }
  return resolved
}

async function resolveRepo(repoPath: string): Promise<string> {
  const resolved = assertDirectory(repoPath)
  const top = await runGit(resolved, ['rev-parse', '--show-toplevel'], { check: false })
  if (top.code !== 0) {
    if (/dubious ownership/i.test(top.stderr)) {
      throw new GitCommandError(gitMessage(top.stderr, top.stdout))
    }
    if (/not a git repository/i.test(top.stderr)) {
      throw new GitCommandError('This folder is not a Git repository.', 'NOT_A_REPO', resolved)
    }
    throw new GitCommandError(gitMessage(top.stderr, top.stdout))
  }
  return path.resolve(top.stdout.trim())
}

export async function repoWatchTargets(repoPath: string): Promise<{ root: string; gitDirs: string[] }> {
  const root = await resolveRepo(repoPath)
  const gitDirResult = await runGit(root, ['rev-parse', '--absolute-git-dir'], { check: true })
  const commonResult = await runGit(root, ['rev-parse', '--git-common-dir'], { check: true })
  const gitDir = path.resolve(gitDirResult.stdout.trim())
  const commonDir = path.resolve(root, commonResult.stdout.trim())
  const gitDirs = commonDir === gitDir ? [gitDir] : [gitDir, commonDir]
  return { root, gitDirs }
}

function assertHash(hash: string) {
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) throw new GitCommandError('Invalid commit')
}

function assertRepoFile(file: string) {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || file.includes('\0')) {
    throw new GitCommandError('Invalid file path')
  }
  if (path.win32.isAbsolute(file) || path.posix.isAbsolute(file) || file.split(/[/\\]/).includes('..')) {
    throw new GitCommandError('Invalid file path')
  }
}

function assertPaths(paths: string[]) {
  if (!Array.isArray(paths) || paths.length === 0) throw new GitCommandError('No files selected')
  if (paths.length > 500) throw new GitCommandError('Too many files')
  for (const file of paths) assertRepoFile(file)
}

function assertNewBranchName(name: string) {
  if (typeof name !== 'string') throw new GitCommandError('Invalid branch name')
  if (name.trim() !== name || name.length === 0 || name.length > 200) {
    throw new GitCommandError('Invalid branch name')
  }
  if (
    name.startsWith('-') ||
    name.startsWith('/') ||
    name.endsWith('/') ||
    name.endsWith('.') ||
    name.includes('..') ||
    name.includes('@{') ||
    name.includes('//') ||
    name.includes('\\') ||
    name.includes(' ')
  ) {
    throw new GitCommandError('Invalid branch name')
  }
  if (!/^[\p{L}\p{N}._/-]+$/u.test(name)) throw new GitCommandError('Invalid branch name')
}

async function readStatus(repo: string) {
  const result = await runGit(repo, ['status', '--porcelain=v1', '-z', '-b', '-uall'], { check: true })
  return parseStatus(result.stdout)
}

async function listBranches(repo: string) {
  const result = await runGit(
    repo,
    ['branch', '-a', '--format=%(refname)%09%(objectname)%09%(HEAD)%09%(upstream:short)'],
    { check: true },
  )
  return parseBranches(result.stdout)
}

async function listRemotes(repo: string) {
  const result = await runGit(repo, ['remote'], { check: true })
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function safeJoin(repo: string, file: string): string {
  assertRepoFile(file)
  const root = path.resolve(repo)
  const abs = path.resolve(root, file)
  const relative = path.relative(root, abs)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new GitCommandError('Invalid file path')
  return abs
}

async function untrackedPreview(repo: string, file: string): Promise<string> {
  const abs = safeJoin(repo, file)
  const info = await stat(abs)
  if (info.size > 200_000) return `New file (${info.size} bytes) is too large to preview.`
  const buffer = await readFile(abs)
  if (buffer.subarray(0, 8000).includes(0)) return 'Binary file.'
  const content = buffer.toString('utf8')
  const lines = content.split(/\r?\n/)
  const body = lines.map((line) => `+${line}`).join('\n')
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${body}`
}

export function loadRepo(repoPath: string): Promise<Result<RepoSnapshot>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const [statusResult, logResult, branchResult, remoteResult] = await Promise.all([
      runGit(repo, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '-b', '-uall'], { check: true }),
      runGit(
        repo,
        [
          '--no-optional-locks',
          'log',
          '--all',
          '--date-order',
          '-n',
          String(LOG_LIMIT + 1),
          '--pretty=format:%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s%x1e',
        ],
        { check: false },
      ),
      runGit(
        repo,
        ['--no-optional-locks', 'branch', '-a', '--format=%(refname)%09%(objectname)%09%(HEAD)%09%(upstream:short)'],
        { check: true },
      ),
      runGit(repo, ['--no-optional-locks', 'remote'], { check: true }),
    ])

    let commits: Commit[] = []
    if (logResult.code === 0) commits = parseLog(logResult.stdout)
    else if (!/does not have any commits/i.test(logResult.stderr)) {
      throw new GitCommandError(gitMessage(logResult.stderr, logResult.stdout))
    }
    const truncated = commits.length > LOG_LIMIT
    if (truncated) commits = commits.slice(0, LOG_LIMIT)

    const { header, changes } = parseStatus(statusResult.stdout)
    let branches = parseBranches(branchResult.stdout)
    if (!branches.some((branch) => !branch.remote && branch.current) && header.name && !header.detached) {
      branches = [{ name: header.name, hash: '', current: true, remote: false }, ...branches]
    }
    branches.sort(
      (a, b) => Number(a.remote) - Number(b.remote) || Number(b.current) - Number(a.current) || a.name.localeCompare(b.name),
    )
    const remotes = remoteResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return { path: repo, header, branches, commits, changes, remotes, truncated }
  })
}

export function commitFiles(repoPath: string, hash: string): Promise<Result<{ files: FileChange[]; body: string }>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertHash(hash)
    const [names, body] = await Promise.all([
      runGit(repo, ['show', '--first-parent', '--format=', '--name-status', '-z', '-M', hash], { check: true }),
      runGit(repo, ['show', '-s', '--format=%b', hash], { check: true }),
    ])
    return { files: parseNameStatusZ(names.stdout), body: body.stdout.trim() }
  })
}

export function commitDiff(repoPath: string, hash: string, file: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertHash(hash)
    assertRepoFile(file)
    const result = await runGit(
      repo,
      ['show', '--first-parent', '--format=', '--no-ext-diff', '--no-textconv', '-M', hash, '--', file],
      { check: true },
    )
    return capText(result.stdout) || 'No diff for this file.'
  })
}

export function workingDiff(repoPath: string, file: string, staged: boolean): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertRepoFile(file)
    if (!staged) {
      const status = await readStatus(repo)
      const change = status.changes.find((item) => item.path === file)
      if (change?.untracked) return capText(await untrackedPreview(repo, file))
    }
    const args = staged
      ? ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', file]
      : ['diff', '--no-ext-diff', '--no-textconv', '--', file]
    const result = await runGit(repo, args, { check: true })
    return capText(result.stdout) || 'No changes.'
  })
}

export function stage(repoPath: string, paths: string[]): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertPaths(paths)
    await runGit(repo, ['add', '--', ...paths], { check: true })
    return `Staged ${paths.length} file${paths.length === 1 ? '' : 's'}`
  })
}

export function stageAll(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    await runGit(repo, ['add', '-A'], { check: true })
    return 'Staged all changes'
  })
}

export function unstage(repoPath: string, paths: string[]): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertPaths(paths)
    await runGit(repo, ['restore', '--staged', '--', ...paths], { check: true })
    return `Unstaged ${paths.length} file${paths.length === 1 ? '' : 's'}`
  })
}

export function unstageAll(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    await runGit(repo, ['restore', '--staged', ':/'], { check: true })
    return 'Unstaged all changes'
  })
}

export function commit(repoPath: string, message: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof message !== 'string' || message.trim().length === 0) throw new GitCommandError('Commit message is empty')
    if (message.length > 100_000) throw new GitCommandError('Commit message is too long')
    const status = await readStatus(repo)
    if (status.changes.some((change) => change.conflict)) {
      throw new GitCommandError('Resolve conflicts before committing')
    }
    if (!status.changes.some((change) => change.staged)) throw new GitCommandError('Stage at least one file')
    await runGit(repo, ['commit', '-F', '-'], { stdin: `${message.trim()}\n`, check: true })
    return 'Commit created'
  })
}

export function checkout(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof name !== 'string' || name.length === 0 || name.length > 300 || name.startsWith('-') || name.includes('\0')) {
      throw new GitCommandError('Invalid branch name')
    }
    const branches = await listBranches(repo)
    const locals = branches.filter((branch) => !branch.remote)
    const remotes = branches.filter((branch) => branch.remote)
    const local = locals.find((branch) => branch.name === name)
    if (local?.current) return `Already on ${name}`
    if (local) {
      await runGit(repo, ['switch', '--', name], { check: true })
      return `Checked out ${name}`
    }
    const remote = remotes.find((branch) => branch.name === name)
    if (!remote) throw new GitCommandError('Branch not found')
    const slash = name.indexOf('/')
    const short = slash === -1 ? name : name.slice(slash + 1)
    if (locals.some((branch) => branch.name === short)) {
      await runGit(repo, ['switch', '--', short], { check: true })
      return `Checked out ${short}`
    }
    await runGit(repo, ['switch', '--track', name], { check: true })
    return `Checked out ${name}`
  })
}

export function createBranch(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertNewBranchName(name)
    const existing = await listBranches(repo)
    if (existing.some((branch) => !branch.remote && branch.name === name)) {
      throw new GitCommandError(`Branch ${name} already exists`)
    }
    await runGit(repo, ['switch', '-c', name], { check: true })
    return `Created and checked out ${name}`
  })
}

export function deleteBranch(repoPath: string, name: string, force: boolean): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof name !== 'string' || name.length === 0 || name.length > 300 || name.startsWith('-') || name.includes('\0')) {
      throw new GitCommandError('Invalid branch name')
    }
    const branches = await listBranches(repo)
    const local = branches.find((branch) => !branch.remote && branch.name === name)
    if (!local) throw new GitCommandError('Local branch not found')
    if (local.current) throw new GitCommandError('Switch to another branch before deleting this one')
    await runGit(repo, ['branch', force ? '-D' : '-d', '--', name], { check: true })
    return `Deleted ${name}`
  })
}

export function cloneRepo(url: string, parentDir: string, folderName: string): Promise<Result<string>> {
  return wrap(async () => {
    const source = url.trim()
    const folder = folderName.trim()
    const urlError = cloneUrlError(source)
    if (urlError) throw new GitCommandError(urlError)
    const nameError = folderNameError(folder)
    if (nameError) throw new GitCommandError(nameError)
    const parent = assertDirectory(parentDir)
    const dest = path.resolve(parent, folder)
    if (path.dirname(dest).toLowerCase() !== parent.toLowerCase()) throw new GitCommandError('Invalid folder name')
    if (existsSync(dest)) throw new GitCommandError('That folder already exists')
    await runGit(parent, ['clone', '--progress', source, folder], { check: true, timeoutMs: 300_000 })
    if (!existsSync(path.join(dest, '.git'))) throw new GitCommandError('Clone finished, but the repository was not created')
    return dest
  })
}

export function push(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const status = await readStatus(repo)
    if (status.header.detached) throw new GitCommandError('Cannot push a detached HEAD')
    const remotes = await listRemotes(repo)
    if (remotes.length === 0) throw new GitCommandError('This repository has no remotes')
    if (status.header.upstream && !status.header.gone) {
      const result = await runGit(repo, ['push'], { check: true, timeoutMs: 120_000 })
      return outputText(result)
    }
    if (!remotes.includes('origin')) {
      throw new GitCommandError('No upstream is set, and there is no origin remote')
    }
    const result = await runGit(repo, ['push', '-u', 'origin', 'HEAD'], { check: true, timeoutMs: 120_000 })
    return outputText(result)
  })
}

export function pull(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const status = await readStatus(repo)
    if (status.header.detached) throw new GitCommandError('Cannot pull a detached HEAD')
    if (!status.header.upstream || status.header.gone) {
      throw new GitCommandError('This branch has no upstream to pull from')
    }
    const result = await runGit(repo, ['pull'], { check: true, timeoutMs: 120_000 })
    return outputText(result)
  })
}

export function fetchRemote(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const remotes = await listRemotes(repo)
    if (remotes.length === 0) throw new GitCommandError('This repository has no remotes')
    const result = await runGit(repo, ['fetch', '--prune'], { check: true, timeoutMs: 120_000 })
    return outputText(result) || 'Fetched'
  })
}

export function initRepo(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const resolved = assertDirectory(repoPath)
    const existing = await runGit(resolved, ['rev-parse', '--is-inside-work-tree'], { check: false })
    if (/dubious ownership/i.test(existing.stderr)) {
      throw new GitCommandError(gitMessage(existing.stderr, existing.stdout))
    }
    if (existing.code === 0 && existing.stdout.trim() === 'true') {
      throw new GitCommandError('This folder is already a Git repository')
    }
    await runGit(resolved, ['init'], { check: true })
    return 'Initialized an empty Git repository'
  })
}
