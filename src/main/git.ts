import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { cloneUrlError, folderNameError } from '../shared/clone'
import type { BranchHeader, BranchInfo, Change, Commit, ConflictSide, Contributor, FileChange, PullMode, PullRequest, PushMode, RefChip, RemoteTag, RemoteTagList, RepoOperation, RepoSnapshot, ResetMode, Result, StashEntry, TagInfo } from '../shared/types'
import { accountForOwner, accountForRepo, assertGitHubSlug, defaultGitHubUsername, GitHubError, githubNetworkEnv, githubPageUrl, githubSessionJson, gitHubSignedIn, hasGitHubAccount, redactSecrets, rememberRepoAccount } from './githubSession'

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
      const message = redactSecrets(error instanceof Error ? error.message : String(error))
      return { ok: false, error: message }
    },
  )
}

function gitMessage(stderr: string, stdout: string): string {
  const text = redactSecrets((stderr || stdout || 'Git command failed').trim())
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
  return redactSecrets([result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n') || 'Done')
}

type RunOptions = {
  stdin?: string
  check?: boolean
  timeoutMs?: number
  editor?: string
  github?: boolean | string
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
          GIT_EDITOR: options?.editor ?? 'true',
          EDITOR: options?.editor ?? 'true',
          ...(options?.editor ? { GIT_SEQUENCE_EDITOR: options.editor } : {}),
          ...(options?.github ? githubNetworkEnv(githubAccountForCommand(repo, options.github, args)) : {}),
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
        reject(new GitCommandError(missing ? 'Git is not installed or not on your PATH.' : redactSecrets(error.message)))
      })
    })

    child.on('close', (code) => {
      finish(() => {
        if (timedOut) {
          reject(new GitCommandError('Git took too long and was stopped.'))
          return
        }
        let stdout = redactSecrets(Buffer.concat(out).toString('utf8'))
        const stderr = redactSecrets(Buffer.concat(err).toString('utf8'))
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
  const seen = new Set<string>()
  const add = (chip: RefChip) => {
    const key = `${chip.kind}:${chip.name}`
    if (seen.has(key)) return
    seen.add(key)
    chips.push(chip)
  }
  for (const part of decoration.split(', ')) {
    if (!part || part.endsWith('/HEAD')) continue
    if (part === 'HEAD') {
      add({ kind: 'head', name: 'detached' })
      continue
    }
    if (part.startsWith('HEAD -> ')) {
      add({ kind: 'branch', name: part.slice('HEAD -> '.length), current: true })
      continue
    }
    if (part.startsWith('tag: ')) {
      add({ kind: 'tag', name: part.slice(5) })
      continue
    }
    if (part.includes('/')) add({ kind: 'remote', name: part })
    else add({ kind: 'branch', name: part })
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

export function parseContributors(stdout: string, selfEmail: string): Contributor[] {
  const self = selfEmail.trim().toLowerCase()
  const seen = new Set<string>()
  const people: Contributor[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const splitAt = line.indexOf('\x1f')
    if (splitAt <= 0) continue
    const name = line.slice(0, splitAt).trim()
    const email = line.slice(splitAt + 1).trim()
    if (!name || !email || name.length > 100 || email.length > 200) continue
    if (/[\r\n<>]/.test(name) || /[\r\n<>\s]/.test(email) || !email.includes('@')) continue
    const key = email.toLowerCase()
    if (key === self || seen.has(key)) continue
    seen.add(key)
    people.push({ name, email })
  }
  people.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  return people
}

export function formatCommitMessage(message: string, people: Contributor[]): string {
  const text = message.trim()
  if (people.length === 0) return `${text}\n`
  const trailers = people.map((person) => `Co-authored-by: ${person.name} <${person.email}>`)
  return `${text}\n\n${trailers.join('\n')}\n`
}

function commitPartners(value: unknown): Contributor[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new GitCommandError('Invalid person')
  if (value.length > 12) throw new GitCommandError('Too many people on this commit')
  const lines: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new GitCommandError('Invalid person')
    const name = (item as { name?: unknown }).name
    const email = (item as { email?: unknown }).email
    if (typeof name !== 'string' || typeof email !== 'string') throw new GitCommandError('Invalid person')
    lines.push(`${name}\x1f${email}`)
  }
  const people = parseContributors(lines.join('\n'), '')
  if (people.length !== value.length) throw new GitCommandError('Enter a name and email for each person')
  return people
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

const STASH_SELECTOR = /^stash@\{(\d+)\}$/

export function parseStashes(stdout: string): StashEntry[] {
  const entries: StashEntry[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length < 4) continue
    const selector = parts[0] ?? ''
    const hash = parts[1] ?? ''
    const time = Number(parts[2])
    const subject = parts.slice(3).join('\x1f').trim()
    const match = STASH_SELECTOR.exec(selector)
    if (!match || !/^[0-9a-f]{40}$/i.test(hash) || !Number.isFinite(time)) continue
    entries.push({
      index: Number(match[1]),
      selector,
      hash,
      time,
      subject: subject || selector,
    })
  }
  return entries
}

export function parseTags(stdout: string): TagInfo[] {
  const tags: TagInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, objectName, peeled] = line.split('\t')
    if (!name || !objectName) continue
    const commit = peeled || objectName
    if (!/^[0-9a-f]{40}$/i.test(commit)) continue
    tags.push({ name, commit, annotated: Boolean(peeled) })
  }
  return tags
}

export function parseRemoteTags(stdout: string): RemoteTag[] {
  const byName = new Map<string, RemoteTag>()
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const oid = line.slice(0, tab).trim()
    const ref = line.slice(tab + 1).trim()
    if (!ref.startsWith('refs/tags/')) continue
    if (!/^[0-9a-f]{40}$/i.test(oid)) continue
    const peeled = ref.endsWith('^{}')
    const name = (peeled ? ref.slice(0, -3) : ref).slice('refs/tags/'.length)
    if (!isSafeTagName(name)) continue
    const existing = byName.get(name)
    if (!existing || peeled) byName.set(name, { name, commit: oid })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function githubSlugFromUrl(url: string): string | null {
  const trimmed = url.trim()
  const ssh = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  if (ssh?.[1] && ssh[2]) return `${ssh[1]}/${ssh[2]}`
  try {
    const parsed = new URL(trimmed)
    if (!/^github\.com$/i.test(parsed.hostname)) return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2 || !parts[0] || !parts[1]) return null
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`
  } catch {
    return null
  }
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

function isSafeTagName(name: string): boolean {
  try {
    assertNewBranchName(name)
    return true
  } catch {
    return false
  }
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
  return newFileDiff(file, buffer.toString('utf8'))
}

function newFileDiff(file: string, content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const header = `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n`
  if (normalized.length === 0) return header
  const missingNewline = !normalized.endsWith('\n')
  const text = missingNewline ? normalized : normalized.slice(0, -1)
  const lines = text.split('\n')
  const body = lines.map((line) => `+${line}`).join('\n')
  const marker = missingNewline ? '\n\\ No newline at end of file' : ''
  return `${header}@@ -0,0 +1,${lines.length} @@\n${body}${marker}\n`
}

export function loadRepo(repoPath: string): Promise<Result<RepoSnapshot>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const [statusResult, logResult, branchResult, remoteResult, tagResult, stashResult, peopleResult, emailResult] = await Promise.all([
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
      runGit(
        repo,
        [
          '--no-optional-locks',
          'for-each-ref',
          '--sort=-creatordate',
          'refs/tags',
          '--format=%(refname:short)%09%(objectname)%09%(*objectname)',
        ],
        { check: true },
      ),
      runGit(repo, ['--no-optional-locks', 'stash', 'list', '--format=%gd%x1f%H%x1f%ct%x1f%gs'], { check: true }),
      runGit(repo, ['--no-optional-locks', 'log', '--all', '-n', '500', '--format=%an%x1f%ae'], { check: false }),
      runGit(repo, ['config', '--get', 'user.email'], { check: false }),
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
    const tags = parseTags(tagResult.stdout)
    const stashes = parseStashes(stashResult.stdout)
    const contributors = peopleResult.code === 0 ? parseContributors(peopleResult.stdout, emailResult.code === 0 ? emailResult.stdout : '') : []
    const operation = await readOperation(repo)
    return { path: repo, header, branches, tags, stashes, commits, changes, remotes, contributors, operation, truncated }
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

export function commit(repoPath: string, message: string, withUsers?: unknown, amend = false): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof message !== 'string' || message.trim().length === 0) throw new GitCommandError('Commit message is empty')
    if (message.length > 100_000) throw new GitCommandError('Commit message is too long')
    const people = commitPartners(withUsers)
    const status = await readStatus(repo)
    if (status.changes.some((change) => change.conflict)) {
      throw new GitCommandError('Resolve conflicts before committing')
    }
    if (amend) {
      if (status.header.empty) throw new GitCommandError('There is no commit to amend')
      if (await readOperation(repo)) throw new GitCommandError('Finish the current operation before amending')
      const identity = await commitIdentityPrefix(repo, 'amend')
      await runGit(repo, [...identity, 'commit', '--amend', '-F', '-'], {
        stdin: formatCommitMessage(message, people),
        check: true,
      })
      return 'Commit amended'
    }
    const staged = status.changes.some((change) => change.staged)
    const pending = status.changes.some((change) => change.unstaged || change.untracked)
    if (!staged && !pending) throw new GitCommandError('Nothing to commit')
    if (!staged) await runGit(repo, ['add', '-A'], { check: true })
    await runGit(repo, ['commit', '-F', '-'], { stdin: formatCommitMessage(message, people), check: true })
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

function runGh(repo: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn('gh', args, {
      cwd: repo,
      windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new GitCommandError('GitHub CLI took too long and was stopped.')))
    }, 30_000)
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(() => {
        reject(new GitCommandError(error.code === 'ENOENT' ? 'GitHub CLI (gh) is not installed or not on your PATH.' : error.message))
      })
    })
    child.on('close', (code) => {
      finish(() => {
        resolve({
          code: code ?? 1,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
        })
      })
    })
    child.stdin?.end()
  })
}

async function githubRemote(repo: string): Promise<{ remote: string; slug: string } | null> {
  const remotes = await listRemotes(repo)
  const ordered = remotes.includes('origin') ? ['origin', ...remotes.filter((name) => name !== 'origin')] : remotes
  for (const remote of ordered) {
    if (remote.startsWith('-')) continue
    const url = await runGit(repo, ['remote', 'get-url', remote], { check: false })
    if (url.code !== 0) continue
    const slug = githubSlugFromUrl(url.stdout.trim())
    if (slug) return { remote, slug }
  }
  return null
}

function parsePullRequestJson(stdout: string): PullRequest[] {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    throw new GitCommandError('GitHub CLI returned an unreadable pull request list')
  }
  if (!Array.isArray(data)) return []
  const requests: PullRequest[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const author = row.author
    const login =
      author && typeof author === 'object' && typeof (author as { login?: unknown }).login === 'string'
        ? (author as { login: string }).login
        : ''
    if (typeof row.number !== 'number' || typeof row.title !== 'string' || typeof row.url !== 'string') continue
    requests.push({
      number: row.number,
      title: row.title,
      url: row.url,
      head: typeof row.headRefName === 'string' ? row.headRefName : '',
      base: typeof row.baseRefName === 'string' ? row.baseRefName : '',
      author: login,
    })
  }
  return requests
}

function assertStashSelector(selector: string): string {
  if (typeof selector !== 'string' || !STASH_SELECTOR.test(selector)) throw new GitCommandError('Invalid stash')
  return selector
}

function assertStashMessage(message: string): string {
  if (typeof message !== 'string') throw new GitCommandError('Invalid stash message')
  const note = message.replace(/\s+/g, ' ').trim()
  if (note.length > 500) throw new GitCommandError('Stash message is too long')
  return note
}

async function commitIdentityPrefix(repo: string, action: string): Promise<string[]> {
  const [name, email] = await Promise.all([
    runGit(repo, ['config', '--get', 'user.name'], { check: false }),
    runGit(repo, ['config', '--get', 'user.email'], { check: false }),
  ])
  if (name.code === 0 && name.stdout.trim() && email.code === 0 && email.stdout.trim()) return []
  const ident = await runGit(repo, ['log', '-1', '--format=%an%x1f%ae'], { check: false })
  const [authorName, authorEmail] = ident.code === 0 ? ident.stdout.trim().split('\x1f') : []
  if (!authorName || !authorEmail) {
    throw new GitCommandError(`Git needs user.name and user.email before it can ${action}. Set them in your Git config, then try again.`)
  }
  return ['-c', `user.name=${authorName}`, '-c', `user.email=${authorEmail}`]
}

export function saveStash(repoPath: string, message: string, includeUntracked: boolean): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const note = assertStashMessage(message)
    const identity = await commitIdentityPrefix(repo, 'stash')
    const args = [...identity, 'stash', 'push']
    if (includeUntracked) args.push('--include-untracked')
    if (note) args.push('-m', note)
    await runGit(repo, args, { check: true })
    return note ? `Stashed ${note}` : 'Stashed current changes'
  })
}

function useStash(repoPath: string, verb: 'apply' | 'pop' | 'drop', selector: string, done: (ref: string) => string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const ref = assertStashSelector(selector)
    await runGit(repo, ['stash', verb, ref], { check: true })
    return done(ref)
  })
}

export function applyStash(repoPath: string, selector: string): Promise<Result<string>> {
  return useStash(repoPath, 'apply', selector, (ref) => `Applied ${ref}`)
}

export function popStash(repoPath: string, selector: string): Promise<Result<string>> {
  return useStash(repoPath, 'pop', selector, (ref) => `Restored ${ref}`)
}

export function dropStash(repoPath: string, selector: string): Promise<Result<string>> {
  return useStash(repoPath, 'drop', selector, (ref) => `Dropped ${ref}`)
}

export function stashDiff(repoPath: string, selector: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const ref = assertStashSelector(selector)
    const shown = await runGit(repo, ['stash', 'show', '-p', '--include-untracked', ref], { check: false })
    if (shown.code === 0) return capText(shown.stdout) || 'This stash has no file changes.'
    if (/unknown option|unrecognized argument|usage:/i.test(`${shown.stderr}\n${shown.stdout}`)) {
      const fallback = await runGit(repo, ['stash', 'show', '-p', ref], { check: true })
      return capText(fallback.stdout) || 'This stash has no file changes.'
    }
    throw new GitCommandError(gitMessage(shown.stderr, shown.stdout))
  })
}

export function createTag(repoPath: string, name: string, message: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertNewBranchName(name)
    const note = typeof message === 'string' ? message.trim() : ''
    if (note.length > 20_000) throw new GitCommandError('Tag message is too long')
    const tags = parseTags(
      (await runGit(repo, ['for-each-ref', 'refs/tags', '--format=%(refname:short)%09%(objectname)%09%(*objectname)'], { check: true })).stdout,
    )
    if (tags.some((tag) => tag.name === name)) throw new GitCommandError(`Tag ${name} already exists`)
    if (!note) {
      await runGit(repo, ['tag', '--', name], { check: true })
      return `Created tag ${name}`
    }
    const ident = await runGit(repo, ['log', '-1', '--format=%an%x1f%ae'], { check: true })
    const [taggerName, taggerEmail] = ident.stdout.trim().split('\x1f')
    if (!taggerName || !taggerEmail) throw new GitCommandError('The current commit has no author, so an annotated tag cannot be created')
    await runGit(repo, ['-c', `user.name=${taggerName}`, '-c', `user.email=${taggerEmail}`, 'tag', '-a', name, '-m', note], { check: true })
    return `Created tag ${name}`
  })
}

export function deleteTag(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertNewBranchName(name)
    await runGit(repo, ['tag', '-d', '--', name], { check: true })
    return `Deleted tag ${name}`
  })
}

export function checkoutTag(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertNewBranchName(name)
    const exists = await runGit(repo, ['show-ref', '--verify', '--quiet', `refs/tags/${name}`], { check: false })
    if (exists.code !== 0) {
      const remotes = await listRemotes(repo)
      const remote = remotes.includes('origin') ? 'origin' : remotes[0]
      if (!remote) throw new GitCommandError(`Tag ${name} was not found`)
      await runGit(repo, ['fetch', remote, 'tag', name], { check: true, github: true, timeoutMs: 120_000 })
    }
    await runGit(repo, ['switch', '--detach', '--', name], { check: true })
    return `Checked out tag ${name}`
  })
}

export function listRemoteTags(repoPath: string): Promise<Result<RemoteTagList>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const remotes = await listRemotes(repo)
    const remote = remotes.includes('origin') ? 'origin' : remotes[0]
    if (!remote) return { remote: null, tags: [], detail: null }
    const result = await runGit(repo, ['ls-remote', '--tags', remote], { check: false, github: true, timeoutMs: 20_000 })
    if (result.code !== 0) {
      const text = (result.stderr || result.stdout || 'Could not read remote tags').trim()
      return { remote, tags: [], detail: text.slice(0, 500) }
    }
    return { remote, tags: parseRemoteTags(result.stdout), detail: null }
  })
}

export function pushTag(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertNewBranchName(name)
    const remotes = await listRemotes(repo)
    if (remotes.length === 0) throw new GitCommandError('This repository has no remotes')
    const remote = remotes.includes('origin') ? 'origin' : remotes[0]
    if (!remote) throw new GitCommandError('This repository has no remotes')
    const result = await runGit(repo, ['push', remote, `refs/tags/${name}`], { check: true, github: true, timeoutMs: 120_000 })
    return outputText(result)
  })
}

type ApiPull = {
  number?: unknown
  title?: unknown
  html_url?: unknown
  head?: { ref?: unknown }
  base?: { ref?: unknown }
  user?: { login?: unknown }
}

function mapApiPull(row: ApiPull): PullRequest | null {
  if (!row || typeof row !== 'object') return null
  if (typeof row.number !== 'number' || !Number.isInteger(row.number) || row.number < 1 || row.number > 1_000_000) return null
  if (typeof row.title !== 'string' || !row.title.trim()) return null
  return {
    number: row.number,
    title: row.title.trim().slice(0, 300),
    url: githubPageUrl(row.html_url) ?? '',
    head: typeof row.head?.ref === 'string' ? row.head.ref : '',
    base: typeof row.base?.ref === 'string' ? row.base.ref : '',
    author: typeof row.user?.login === 'string' ? row.user.login : '',
  }
}

export function listPullRequests(repoPath: string): Promise<Result<{ requests: PullRequest[]; detail: string | null }>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const github = await githubRemote(repo)
    if (!github) return { requests: [], detail: 'Pull requests need a GitHub remote.' }
    if (gitHubSignedIn()) {
      try {
        const actor = githubActor(repo, github.slug)
        const rows = await githubSessionJson<ApiPull[]>(`/repos/${assertGitHubSlug(github.slug)}/pulls?state=open&per_page=50`, actor)
        if (!Array.isArray(rows)) return { requests: [], detail: 'GitHub returned an unreadable response.' }
        const requests = rows.flatMap((row) => {
          const request = mapApiPull(row)
          return request ? [request] : []
        })
        return { requests, detail: null }
      } catch (error) {
        if (error instanceof GitHubError) return { requests: [], detail: error.message.slice(0, 500) }
        throw error
      }
    }
    try {
      const result = await runGh(repo, [
        'pr',
        'list',
        '--repo',
        github.slug,
        '--state',
        'open',
        '--limit',
        '50',
        '--json',
        'number,title,url,headRefName,baseRefName,author',
      ])
      if (result.code !== 0) {
        const text = (result.stderr || result.stdout || 'Could not list pull requests').trim()
        return { requests: [], detail: text.slice(0, 500) }
      }
      return { requests: parsePullRequestJson(result.stdout), detail: null }
    } catch (error) {
      if (error instanceof GitCommandError && /not installed/i.test(error.message)) {
        return { requests: [], detail: 'Sign in to GitHub in Settings, or install the GitHub CLI (gh).' }
      }
      throw error
    }
  })
}

export function checkoutPullRequest(repoPath: string, number: number): Promise<Result<string>> {
  return wrap(async () => {
    if (!Number.isInteger(number) || number < 1 || number > 1_000_000) throw new GitCommandError('Invalid pull request')
    const repo = await resolveRepo(repoPath)
    const github = await githubRemote(repo)
    if (!github) throw new GitCommandError('Pull requests need a GitHub remote')
    if (gitHubSignedIn()) {
      const actor = githubActor(repo, github.slug)
      await githubSessionJson(`/repos/${assertGitHubSlug(github.slug)}/pulls/${number}`, actor)
      const branch = `pr-${number}`
      await runGit(repo, ['fetch', github.remote, `pull/${number}/head:refs/heads/${branch}`], {
        check: true,
        github: actor ?? true,
        timeoutMs: 120_000,
      })
      await runGit(repo, ['switch', '--', branch], { check: true })
      return `Checked out pull request #${number}`
    }
    const result = await runGh(repo, ['pr', 'checkout', String(number), '--repo', github.slug])
    if (result.code !== 0) throw new GitCommandError(gitMessage(result.stderr, result.stdout))
    return `Checked out pull request #${number}`
  })
}

export function createPullRequest(repoPath: string, title: string, base: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const text = title.trim()
    if (!text || text.length > 256) throw new GitCommandError('Enter a pull request title')
    assertNewBranchName(base)
    const status = await readStatus(repo)
    if (status.header.detached || status.header.empty) throw new GitCommandError('Checkout a branch before opening a pull request')
    const github = await githubRemote(repo)
    if (!github) throw new GitCommandError('Pull requests need a GitHub remote')
    if (gitHubSignedIn()) {
      const actor = githubActor(repo, github.slug)
      const created = await githubSessionJson<{ html_url?: unknown }>(`/repos/${assertGitHubSlug(github.slug)}/pulls`, actor, {
        method: 'POST',
        body: JSON.stringify({ title: text, head: status.header.name, base, body: '' }),
      })
      return githubPageUrl(created.html_url) ?? `Opened pull request from ${status.header.name}`
    }
    const result = await runGh(repo, ['pr', 'create', '--repo', github.slug, '--base', base, '--head', status.header.name, '--title', text, '--body', ''])
    if (result.code !== 0) throw new GitCommandError(gitMessage(result.stderr, result.stdout))
    return outputText(result) || `Opened pull request from ${status.header.name}`
  })
}

export function cloneRepo(url: string, parentDir: string, folderName: string, account?: string): Promise<Result<string>> {
  return wrap(async () => {
    const source = url.trim()
    const folder = folderName.trim()
    const urlError = cloneUrlError(source)
    if (urlError) throw new GitCommandError(urlError)
    const nameError = folderNameError(folder)
    if (nameError) throw new GitCommandError(nameError)
    const requested = account?.trim()
    if (requested && !hasGitHubAccount(requested)) throw new GitCommandError('That GitHub account is not signed in.')
    const chosen = requested || accountForOwner(githubSlugFromUrl(source)?.split('/')[0]) || defaultGitHubUsername()
    const parent = assertDirectory(parentDir)
    const dest = path.resolve(parent, folder)
    if (path.dirname(dest).toLowerCase() !== parent.toLowerCase()) throw new GitCommandError('Invalid folder name')
    if (existsSync(dest)) throw new GitCommandError('That folder already exists')
    await runGit(parent, ['clone', '--progress', source, folder], { check: true, github: chosen ?? true, timeoutMs: 300_000 })
    if (!existsSync(path.join(dest, '.git'))) throw new GitCommandError('Clone finished, but the repository was not created')
    if (chosen) await rememberRepoAccount(dest, chosen)
    return dest
  })
}

function githubActor(repo: string, slug: string | null): string | undefined {
  return accountForRepo(repo) ?? accountForOwner(slug?.split('/')[0])
}

function githubAccountForCommand(repo: string, github: boolean | string, args: string[]): string | undefined {
  if (typeof github === 'string' && github.trim()) return github.trim()
  return githubActor(repo, args.map((arg) => githubSlugFromUrl(arg)).find((slug) => slug) ?? null)
}

const REMOTE_NAME = /^[A-Za-z0-9._/-]+$/

export function push(repoPath: string, mode: PushMode = 'default', remote?: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const status = await readStatus(repo)
    if (status.header.detached) throw new GitCommandError('Cannot push a detached HEAD')
    const remotes = await listRemotes(repo)
    if (remotes.length === 0) throw new GitCommandError('This repository has no remotes')
    if (mode !== 'default' && mode !== 'lease') throw new GitCommandError('Invalid push')
    const flag = mode === 'lease' ? ['--force-with-lease'] : []
    if (typeof remote === 'string' && remote.length > 0) {
      if (!REMOTE_NAME.test(remote) || remote.startsWith('-') || remote.includes('..') || !remotes.includes(remote)) {
        throw new GitCommandError('Unknown remote')
      }
      const result = await runGit(repo, ['push', ...flag, '-u', remote, 'HEAD'], { check: true, github: true, timeoutMs: 120_000 })
      return outputText(result)
    }
    if (status.header.upstream && !status.header.gone) {
      const result = await runGit(repo, ['push', ...flag], { check: true, github: true, timeoutMs: 120_000 })
      return outputText(result)
    }
    if (!remotes.includes('origin')) {
      throw new GitCommandError('No upstream is set, and there is no origin remote')
    }
    const result = await runGit(repo, ['push', ...flag, '-u', 'origin', 'HEAD'], { check: true, github: true, timeoutMs: 120_000 })
    return outputText(result)
  })
}

async function readOperation(repo: string): Promise<RepoOperation | null> {
  const gitDirResult = await runGit(repo, ['rev-parse', '--absolute-git-dir'], { check: true })
  const dir = path.resolve(gitDirResult.stdout.trim())
  if (existsSync(path.join(dir, 'rebase-merge')) || existsSync(path.join(dir, 'rebase-apply'))) return 'rebase'
  if (existsSync(path.join(dir, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(path.join(dir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(path.join(dir, 'REVERT_HEAD'))) return 'revert'
  return null
}

async function requireIdle(repo: string) {
  const operation = await readOperation(repo)
  if (operation) throw new GitCommandError(`Finish the ${operation} before starting another`)
}

function operationLabel(operation: RepoOperation): string {
  if (operation === 'cherry-pick') return 'Cherry-pick'
  if (operation === 'merge') return 'Merge'
  if (operation === 'rebase') return 'Rebase'
  return 'Revert'
}

const QUIET_EDITOR = ':'

export function discard(repoPath: string, paths: string[]): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertPaths(paths)
    const status = await readStatus(repo)
    const known = new Map(status.changes.map((change) => [change.path, change]))
    for (const file of paths) {
      if (!known.has(file)) throw new GitCommandError('File is not changed')
    }
    const untracked = paths.filter((file) => known.get(file)?.untracked)
    const tracked = paths.filter((file) => !known.get(file)?.untracked)
    for (const file of tracked) {
      const restored = await runGit(repo, ['restore', '--source=HEAD', '--staged', '--worktree', '--', file], { check: false })
      if (restored.code === 0) continue
      const change = known.get(file)
      if (change?.index !== 'A') throw new GitCommandError(gitMessage(restored.stderr, restored.stdout))
      await runGit(repo, ['rm', '-f', '--', file], { check: true })
    }
    if (untracked.length > 0) await runGit(repo, ['clean', '-f', '--', ...untracked], { check: true })
    return `Discarded ${paths.length} file${paths.length === 1 ? '' : 's'}`
  })
}

export function takeSide(repoPath: string, file: string, side: ConflictSide): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertRepoFile(file)
    if (side !== 'ours' && side !== 'theirs') throw new GitCommandError('Invalid conflict side')
    if (!(await readOperation(repo))) throw new GitCommandError('No merge, rebase, cherry-pick, or revert is in progress')
    const status = await readStatus(repo)
    const change = status.changes.find((item) => item.path === file)
    if (!change?.conflict) throw new GitCommandError('That file is not in conflict')
    await runGit(repo, ['checkout', `--${side}`, '--', file], { check: true })
    await runGit(repo, ['add', '--', file], { check: true })
    return side === 'ours' ? `Kept our version of ${file}` : `Kept their version of ${file}`
  })
}

export function continueOperation(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const operation = await readOperation(repo)
    if (!operation) throw new GitCommandError('Nothing to continue')
    const status = await readStatus(repo)
    if (status.changes.some((change) => change.conflict)) throw new GitCommandError('Resolve conflicts before continuing')
    const identity = await commitIdentityPrefix(repo, 'continue')
    const verb = operation === 'cherry-pick' ? 'cherry-pick' : operation
    await runGit(repo, [...identity, verb, '--continue'], { check: true, editor: QUIET_EDITOR })
    return `${operationLabel(operation)} continued`
  })
}

export function abortOperation(repoPath: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const operation = await readOperation(repo)
    if (!operation) throw new GitCommandError('Nothing to abort')
    const verb = operation === 'cherry-pick' ? 'cherry-pick' : operation
    await runGit(repo, [verb, '--abort'], { check: true })
    return `${operationLabel(operation)} aborted`
  })
}

async function commitParentCount(repo: string, hash: string): Promise<number> {
  const result = await runGit(repo, ['rev-list', '--parents', '-n', '1', hash], { check: true })
  const parts = result.stdout.trim().split(/\s+/)
  return Math.max(0, parts.length - 1)
}

export function cherryPick(repoPath: string, hash: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertHash(hash)
    await requireIdle(repo)
    const parents = await commitParentCount(repo, hash)
    const identity = await commitIdentityPrefix(repo, 'cherry-pick')
    const args = [...identity, 'cherry-pick']
    if (parents > 1) args.push('-m', '1')
    args.push(hash)
    const result = await runGit(repo, args, { check: false, editor: QUIET_EDITOR })
    if (result.code !== 0) throw new GitCommandError(gitMessage(result.stderr, result.stdout))
    return `Cherry-picked ${hash.slice(0, 7)}`
  })
}

export function revert(repoPath: string, hash: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertHash(hash)
    await requireIdle(repo)
    const parents = await commitParentCount(repo, hash)
    const identity = await commitIdentityPrefix(repo, 'revert')
    const args = [...identity, 'revert', '--no-edit']
    if (parents > 1) args.push('-m', '1')
    args.push(hash)
    const result = await runGit(repo, args, { check: false, editor: QUIET_EDITOR })
    if (result.code !== 0) throw new GitCommandError(gitMessage(result.stderr, result.stdout))
    return `Reverted ${hash.slice(0, 7)}`
  })
}

export function resetTo(repoPath: string, hash: string, mode: ResetMode): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    assertHash(hash)
    if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') throw new GitCommandError('Invalid reset mode')
    await requireIdle(repo)
    await runGit(repo, ['reset', `--${mode}`, hash], { check: true })
    return `Reset ${mode} to ${hash.slice(0, 7)}`
  })
}

export function mergeBranch(repoPath: string, name: string): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof name !== 'string' || name.length === 0 || name.length > 300 || name.startsWith('-') || name.includes('\0')) {
      throw new GitCommandError('Invalid branch name')
    }
    await requireIdle(repo)
    const branches = await listBranches(repo)
    const local = branches.find((branch) => !branch.remote && branch.name === name)
    if (!local) throw new GitCommandError('Branch not found')
    if (local.current) throw new GitCommandError('That branch is already checked out')
    const identity = await commitIdentityPrefix(repo, 'merge')
    const result = await runGit(repo, [...identity, 'merge', '--no-edit', '--', name], { check: false, editor: QUIET_EDITOR })
    if (result.code !== 0) throw new GitCommandError(gitMessage(result.stderr, result.stdout))
    return outputText(result) || `Merged ${name}`
  })
}

export function applyHunk(repoPath: string, patch: string, reverse: boolean): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    if (typeof patch !== 'string' || patch.length === 0 || patch.length > 1_000_000 || patch.includes('\0')) {
      throw new GitCommandError('Invalid patch')
    }
    const normalized = patch.replace(/\r\n/g, '\n')
    if (!normalized.startsWith('diff --git ')) throw new GitCommandError('Invalid patch')
    const headers = normalized.split('\n').filter((line) => line.startsWith('diff --git '))
    if (headers.length !== 1 || !normalized.includes('\n@@ ')) throw new GitCommandError('Invalid patch')
    const args = ['apply', '--cached', '--whitespace=nowarn']
    if (reverse) args.push('-R')
    args.push('-')
    await runGit(repo, args, { stdin: normalized.endsWith('\n') ? normalized : `${normalized}\n`, check: true })
    return reverse ? 'Unstaged hunk' : 'Staged hunk'
  })
}

function pullArgs(mode: PullMode): string[] {
  if (mode === 'ff') return ['pull', '--no-rebase', '--ff', '--no-edit']
  if (mode === 'ff-only') return ['pull', '--no-rebase', '--ff-only']
  if (mode === 'rebase') return ['pull', '--rebase']
  if (mode === 'default') return ['pull']
  throw new GitCommandError('Invalid pull mode')
}

export function pull(repoPath: string, mode: PullMode = 'default'): Promise<Result<string>> {
  return wrap(async () => {
    const repo = await resolveRepo(repoPath)
    const status = await readStatus(repo)
    if (status.header.detached) throw new GitCommandError('Cannot pull a detached HEAD')
    if (!status.header.upstream || status.header.gone) {
      throw new GitCommandError('This branch has no upstream to pull from')
    }
    const identity = await commitIdentityPrefix(repo, 'pull')
    const result = await runGit(repo, [...identity, ...pullArgs(mode)], { check: true, github: true, timeoutMs: 120_000 })
    return outputText(result)
  })
}

async function fetchRemotes(repoPath: string, all: boolean): Promise<string> {
  const repo = await resolveRepo(repoPath)
  const remotes = await listRemotes(repo)
  if (remotes.length === 0) throw new GitCommandError('This repository has no remotes')
  const args = all ? ['fetch', '--all', '--prune'] : ['fetch', '--prune']
  const result = await runGit(repo, args, { check: true, github: true, timeoutMs: 120_000 })
  return outputText(result) || (all ? 'Fetched all remotes' : 'Fetched')
}

export function fetchRemote(repoPath: string): Promise<Result<string>> {
  return wrap(() => fetchRemotes(repoPath, false))
}

export function fetchAll(repoPath: string): Promise<Result<string>> {
  return wrap(() => fetchRemotes(repoPath, true))
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
