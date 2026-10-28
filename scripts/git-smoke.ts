import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { layoutCommits } from '../src/shared/layout'
import { cloneUrlError, folderNameError, folderNameFromCloneUrl } from '../src/shared/clone'
import type { Commit } from '../src/shared/types'
import {
  checkout,
  checkoutTag,
  cloneRepo,
  commit,
  commitDiff,
  commitFiles,
  createBranch,
  createTag,
  deleteBranch,
  deleteTag,
  fetchRemote,
  initRepo,
  listPullRequests,
  loadRepo,
  parseBranchHeader,
  parseBranches,
  parseLog,
  parseNameStatusZ,
  parseStatus,
  parseTags,
  githubSlugFromUrl,
  pull,
  stage,
  workingDiff,
} from '../src/main/git'

function commitFixture(hash: string, parents: string[]): Commit {
  return { hash, parents, author: 'Ada', time: 0, subject: hash, refs: [], head: false }
}

function layoutTests() {
  const straight = layoutCommits([
    commitFixture('A', ['B']),
    commitFixture('B', ['C']),
    commitFixture('C', []),
  ])
  assert.deepEqual(straight.map((row) => row.col), [0, 0, 0])

  const merge = layoutCommits([
    commitFixture('M', ['A', 'C']),
    commitFixture('A', ['B']),
    commitFixture('C', ['B']),
    commitFixture('B', []),
  ])
  assert.deepEqual(merge.map((row) => row.col), [0, 0, 1, 0])
  assert.deepEqual(merge[0]?.edges, [
    { from: 0, to: 0 },
    { from: 0, to: 1 },
  ])
  assert.deepEqual(merge[2]?.edges, [{ from: 1, to: 0 }])

  const fork = layoutCommits([
    commitFixture('M', ['B']),
    commitFixture('F', ['B']),
    commitFixture('B', []),
  ])
  assert.equal(fork[0]?.col, 0)
  assert.equal(fork[1]?.col, 1)
  assert.deepEqual(fork[1]?.edges, [{ from: 1, to: 0 }])
}

function parserTests() {
  const ahead = parseBranchHeader('## main...origin/main [ahead 1, behind 2]')
  assert.equal(ahead.name, 'main')
  assert.equal(ahead.upstream, 'origin/main')
  assert.equal(ahead.ahead, 1)
  assert.equal(ahead.behind, 2)
  assert.equal(parseBranchHeader('## No commits yet on main').empty, true)
  assert.equal(parseBranchHeader('## No commits yet on main').name, 'main')
  assert.equal(parseBranchHeader('## HEAD (no branch)').detached, true)
  assert.equal(parseBranchHeader('## main...origin/main [gone]').gone, true)

  const status = parseStatus('## main...origin/main [ahead 1, behind 2]\0 M README.md\0A  staged.txt\0?? notes.txt\0')
  assert.equal(status.changes.length, 3)
  assert.equal(status.changes[0]?.path, 'README.md')
  assert.equal(status.changes[0]?.unstaged, true)
  assert.equal(status.changes[0]?.staged, false)
  assert.equal(status.changes[1]?.staged, true)
  assert.equal(status.changes[1]?.path, 'staged.txt')
  assert.equal(status.changes[2]?.untracked, true)

  const renamed = parseStatus('## main\0R  old.ts\0new.ts\0')
  assert.equal(renamed.changes[0]?.oldPath, 'old.ts')
  assert.equal(renamed.changes[0]?.path, 'new.ts')
  assert.equal(renamed.changes[0]?.staged, true)

  const hash = 'a'.repeat(40)
  const parent = 'b'.repeat(40)
  const raw = `${hash}\x1f${parent}\x1fAda\x1f1700000000\x1fHEAD -> main, origin/main, tag: v0.1.0\x1fInitial commit\x1e\n`
  const commits = parseLog(raw)
  assert.equal(commits[0]?.head, true)
  assert.equal(commits[0]?.parents[0], parent)
  assert.equal(commits[0]?.refs.some((ref) => ref.kind === 'tag' && ref.name === 'v0.1.0'), true)
  assert.equal(commits[0]?.refs.some((ref) => ref.current && ref.name === 'main'), true)

  const branches = parseBranches(
    'refs/heads/main\tabc\t*\torigin/main\nrefs/remotes/origin/HEAD\tdef\t \t\nrefs/remotes/origin/main\tabc\t \t\n',
  )
  assert.equal(branches.length, 2)
  assert.equal(branches[0]?.current, true)
  assert.equal(branches[0]?.upstream, 'origin/main')
  assert.equal(branches[1]?.remote, true)
  const tagCommit = 'c'.repeat(40)
  const tagObject = 'd'.repeat(40)
  const peeled = 'e'.repeat(40)
  assert.deepEqual(parseTags(`v0.1.0\t${tagCommit}\t\nv1.0.0\t${tagObject}\t${peeled}\n`), [
    { name: 'v0.1.0', commit: tagCommit, annotated: false },
    { name: 'v1.0.0', commit: peeled, annotated: true },
  ])
  assert.equal(githubSlugFromUrl('git@github.com:acme/graphgit.git'), 'acme/graphgit')
  assert.equal(githubSlugFromUrl('https://github.com/acme/graphgit'), 'acme/graphgit')
  assert.equal(githubSlugFromUrl('https://gitlab.com/acme/graphgit.git'), null)

  assert.deepEqual(parseNameStatusZ('M\0src/app.ts\0A\0README.md\0'), [
    { status: 'M', path: 'src/app.ts' },
    { status: 'A', path: 'README.md' },
  ])
  assert.deepEqual(parseNameStatusZ('R100\0old.ts\0new.ts\0'), [
    { status: 'R100', path: 'new.ts', oldPath: 'old.ts' },
  ])
}

function demoGit(cwd: string, args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=GraphGit Demo', '-c', 'user.email=demo@graphgit.local', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    },
  )
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}\n${result.stderr}\n${result.stdout}`)
  }
  return result.stdout
}

const demo = path.join(tmpdir(), 'graphgit-demo')
const remote = path.join(tmpdir(), 'graphgit-demo-remote.git')

async function buildDemo() {
  await rm(demo, { recursive: true, force: true })
  await rm(remote, { recursive: true, force: true })
  await mkdir(demo, { recursive: true })
  demoGit(tmpdir(), ['init', '--bare', '-b', 'main', remote])
  demoGit(demo, ['init', '-b', 'main'])
  await writeFile(path.join(demo, 'README.md'), '# GraphGit demo\n\nA sample repository for the graph.\n')
  demoGit(demo, ['add', 'README.md'])
  demoGit(demo, ['commit', '-m', 'Initial commit'])
  await mkdir(path.join(demo, 'src'), { recursive: true })
  await writeFile(path.join(demo, 'src', 'app.ts'), 'export const version = 1\n')
  demoGit(demo, ['add', 'src/app.ts'])
  demoGit(demo, ['commit', '-m', 'Add app shell'])
  demoGit(demo, ['switch', '-c', 'feature'])
  await writeFile(path.join(demo, 'src', 'graph.ts'), 'export function layout() {\n  return []\n}\n')
  demoGit(demo, ['add', 'src/graph.ts'])
  demoGit(demo, ['commit', '-m', 'Add graph layout'])
  demoGit(demo, ['switch', 'main'])
  await writeFile(path.join(demo, 'src', 'toolbar.ts'), 'export function toolbar() {}\n')
  demoGit(demo, ['add', 'src/toolbar.ts'])
  demoGit(demo, ['commit', '-m', 'Add toolbar'])
  demoGit(demo, ['merge', '--no-ff', 'feature', '-m', "Merge branch 'feature'"])
  demoGit(demo, ['remote', 'add', 'origin', remote])
  demoGit(demo, ['push', '-u', 'origin', 'main'])
  demoGit(demo, ['push', 'origin', 'feature'])
  await writeFile(path.join(demo, 'RELEASE.md'), 'Prepare release\n')
  demoGit(demo, ['add', 'RELEASE.md'])
  demoGit(demo, ['commit', '-m', 'Prepare release'])
  demoGit(demo, ['tag', 'v0.1.0'])
}

async function main() {
  layoutTests()
  parserTests()
  await buildDemo()
  console.log(`DEMO_REPO=${demo}`)

  const opened = await loadRepo(demo)
  assert.equal(opened.ok, true)
  if (!opened.ok) return
  assert.equal(opened.data.header.name, 'main')
  assert.equal(opened.data.header.ahead, 1)
  assert.ok(opened.data.commits.length >= 6)
  assert.ok(opened.data.commits.some((commit) => commit.parents.length === 2))
  assert.ok(opened.data.commits.some((commit) => commit.head && commit.refs.some((ref) => ref.kind === 'tag')))
  assert.ok(opened.data.tags.some((tag) => tag.name === 'v0.1.0'))
  assert.ok(opened.data.branches.some((branch) => branch.name === 'feature'))
  assert.equal(layoutCommits(opened.data.commits).length, opened.data.commits.length)

  const head = opened.data.commits.find((commit) => commit.head)
  assert.ok(head)
  if (!head) return
  const files = await commitFiles(demo, head.hash)
  assert.equal(files.ok, true)
  if (!files.ok) return
  assert.ok(files.data.files.some((file) => file.path === 'RELEASE.md'))
  const diff = await commitDiff(demo, head.hash, 'RELEASE.md')
  assert.equal(diff.ok, true)
  if (diff.ok) assert.match(diff.data, /Prepare release/)

  const toFeature = await checkout(demo, 'feature')
  assert.equal(toFeature.ok, true)
  const viaRemote = await checkout(demo, 'origin/feature')
  assert.equal(viaRemote.ok, true)
  const toMain = await checkout(demo, 'main')
  assert.equal(toMain.ok, true)
  const created = await createBranch(demo, 'scratch-branch')
  assert.equal(created.ok, true)
  assert.equal((await checkout(demo, 'main')).ok, true)
  demoGit(demo, ['branch', '-D', 'scratch-branch'])

  const fetched = await fetchRemote(demo)
  assert.equal(fetched.ok, true, fetched.ok ? '' : fetched.error)
  const pulled = await pull(demo)
  assert.equal(pulled.ok, true, pulled.ok ? '' : pulled.error)

  const readme = path.join(demo, 'README.md')
  await writeFile(readme, '# GraphGit demo\n\nA sample repository for the graph.\n\nLocal edit.\n')
  await writeFile(path.join(demo, 'notes.txt'), 'Untracked note\n')
  await writeFile(path.join(demo, 'staged.txt'), 'Staged content\n')
  const staged = await stage(demo, ['staged.txt'])
  assert.equal(staged.ok, true, staged.ok ? '' : staged.error)

  const dirty = await loadRepo(demo)
  assert.equal(dirty.ok, true)
  if (!dirty.ok) return
  assert.deepEqual(
    dirty.data.changes.map((change) => change.path).sort(),
    ['README.md', 'notes.txt', 'staged.txt'],
    JSON.stringify(dirty.data.changes),
  )
  const note = dirty.data.changes.find((change) => change.path === 'notes.txt')
  const readmeChange = dirty.data.changes.find((change) => change.path === 'README.md')
  const stagedChange = dirty.data.changes.find((change) => change.path === 'staged.txt')
  assert.equal(note?.untracked, true)
  assert.equal(readmeChange?.unstaged, true)
  assert.equal(stagedChange?.staged, true)

  const noteDiff = await workingDiff(demo, 'notes.txt', false)
  assert.equal(noteDiff.ok, true)
  if (noteDiff.ok) assert.match(noteDiff.data, /\+Untracked note/)
  const readmeDiff = await workingDiff(demo, 'README.md', false)
  assert.equal(readmeDiff.ok, true)
  if (readmeDiff.ok) assert.match(readmeDiff.data, /Local edit/)

  const emptyDir = path.join(tmpdir(), 'graphgit-init-test')
  await rm(emptyDir, { recursive: true, force: true })
  await mkdir(emptyDir)
  const missing = await loadRepo(emptyDir)
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.code, 'NOT_A_REPO')
  const createdRepo = await initRepo(emptyDir)
  assert.equal(createdRepo.ok, true)
  const fresh = await loadRepo(emptyDir)
  assert.equal(fresh.ok, true)
  if (fresh.ok) assert.equal(fresh.data.commits.length, 0)

  const commitDir = path.join(tmpdir(), 'graphgit-commit-test')
  await rm(commitDir, { recursive: true, force: true })
  await mkdir(commitDir)
  assert.equal((await initRepo(commitDir)).ok, true)
  await writeFile(path.join(commitDir, 'hello.txt'), 'hello\n')
  assert.equal((await stage(commitDir, ['hello.txt'])).ok, true)
  const committed = await commit(commitDir, 'Test commit')
  if (committed.ok) assert.equal(committed.data, 'Commit created')
  else assert.ok(committed.error.length > 0)

  assert.equal(folderNameFromCloneUrl('https://github.com/acme/graphgit.git'), 'graphgit')
  assert.equal(cloneUrlError('-evil'), 'That URL cannot be cloned')
  assert.equal(folderNameError('../etc'), 'Invalid folder name')
  const cloneParent = path.join(tmpdir(), 'graphgit-clone-parent')
  await rm(cloneParent, { recursive: true, force: true })
  await mkdir(cloneParent)
  const cloned = await cloneRepo(demo, cloneParent, 'graphgit-demo-copy')
  assert.equal(cloned.ok, true)
  if (cloned.ok) {
    const loadedClone = await loadRepo(cloned.data)
    assert.equal(loadedClone.ok, true)
    if (loadedClone.ok) assert.ok(loadedClone.data.commits.length > 0)
    const createdLocal = await createBranch(cloned.data, 'temp-delete')
    assert.equal(createdLocal.ok, true)
    const blocked = await deleteBranch(cloned.data, 'temp-delete', false)
    assert.equal(blocked.ok, false)
    assert.equal((await checkout(cloned.data, 'main')).ok, true)
    const removed = await deleteBranch(cloned.data, 'temp-delete', false)
    assert.equal(removed.ok, true)
    const currentBranch = await deleteBranch(cloned.data, 'main', false)
    assert.equal(currentBranch.ok, false)
    const tagged = await createTag(cloned.data, 'v9.9.9', 'Temporary tag')
    assert.equal(tagged.ok, true, tagged.ok ? '' : tagged.error)
    const withTag = await loadRepo(cloned.data)
    assert.equal(withTag.ok, true)
    if (withTag.ok) assert.ok(withTag.data.tags.some((tag) => tag.name === 'v9.9.9' && tag.annotated))
    assert.equal((await checkoutTag(cloned.data, 'v9.9.9')).ok, true)
    assert.equal((await checkout(cloned.data, 'main')).ok, true)
    assert.equal((await deleteTag(cloned.data, 'v9.9.9')).ok, true)
    const pulls = await listPullRequests(cloned.data)
    assert.equal(pulls.ok, true)
    if (pulls.ok) {
      assert.equal(pulls.data.requests.length, 0)
      assert.match(pulls.data.detail ?? '', /GitHub remote/)
    }
  }
  const rejected = await cloneRepo('-bad', cloneParent, 'nope')
  assert.equal(rejected.ok, false)

  console.log('smoke ok')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
