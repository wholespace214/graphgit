import type { Commit, FileChange } from '@shared/types'
import { useRef } from 'react'
import { formatWhen, shortHash } from '../format'
import { FILES_MAX, FILES_MIN, clamp } from '../layout'
import { DiffView } from './DiffView'
import { StatusBadge } from './StatusBadge'
import { WidthHandle } from './WidthHandle'

export function Detail({
  panel,
  loading,
  error,
  commit,
  files,
  body,
  activeFile,
  diff,
  workPath,
  workStaged,
  stashTitle,
  stashMeta,
  onSelectFile,
  onCopy,
  filesHeight,
  onFilesHeight,
}: {
  panel: 'commit' | 'work' | 'stash'
  loading: boolean
  error: string | null
  commit: Commit | null
  files: FileChange[]
  body: string
  activeFile: string | null
  diff: string
  workPath: string | null
  workStaged: boolean
  stashTitle: string | null
  stashMeta: string | null
  onSelectFile: (path: string) => void
  onCopy: (text: string) => void
  filesHeight: number
  onFilesHeight: (height: number) => void
}) {
  const partners = coAuthorNames(body)
  const note = commitBody(body)
  const rootRef = useRef<HTMLElement>(null)
  const filesRef = useRef(filesHeight)
  filesRef.current = filesHeight

  function resizeFiles(delta: number) {
    const total = rootRef.current?.clientHeight ?? 0
    const max = total > 0 ? Math.max(FILES_MIN, total - 120) : FILES_MAX
    const next = clamp(filesRef.current + delta, FILES_MIN, Math.min(FILES_MAX, max))
    filesRef.current = next
    onFilesHeight(next)
  }

  return (
    <aside className="detail" ref={rootRef}>
      {panel === 'stash' && stashTitle !== null ? (
        <>
          <div className="detail-head">
            <h2 title={stashTitle}>{stashTitle || 'Stash'}</h2>
            {stashMeta && <p className="meta">{stashMeta}</p>}
          </div>
          <div className="diff-wrap">
            {loading ? <p className="muted pad">Loading diff…</p> : <DiffView text={error ?? diff} />}
          </div>
        </>
      ) : panel === 'work' && workPath ? (
        <>
          <div className="detail-head">
            <h2 title={workPath}>{workPath}</h2>
            <span className="muted">{workStaged ? 'Staged change' : 'Unstaged change'}</span>
          </div>
          <div className="diff-wrap">
            {loading ? <p className="muted pad">Loading diff…</p> : <DiffView text={error ?? diff} />}
          </div>
        </>
      ) : commit ? (
        <>
          <div className="detail-head">
            <h2 title={commit.subject}>{commit.subject || 'Empty message'}</h2>
            <p className="meta">
              {commit.author}
              {partners.length > 0 ? ` with ${partners.join(', ')}` : ''} · {formatWhen(commit.time)}
            </p>
            <button className="hash-button mono" onClick={() => onCopy(commit.hash)} title="Copy hash">
              {commit.hash}
            </button>
            {commit.parents.length > 1 && (
              <p className="parents">Merge of {commit.parents.map((parent) => shortHash(parent)).join(' + ')}</p>
            )}
            {note && <pre className="commit-body">{note}</pre>}
          </div>
          <div className="file-list" style={{ height: filesHeight }}>
            {files.length === 0 && !loading && <p className="muted pad">No file changes.</p>}
            {files.map((file) => (
              <button
                key={`${file.status}-${file.path}`}
                className={file.path === activeFile ? 'file-row on' : 'file-row'}
                onClick={() => onSelectFile(file.path)}
                title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
              >
                <StatusBadge code={file.status} />
                <span className="file-path">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</span>
              </button>
            ))}
          </div>
          <WidthHandle
            axis="y"
            label="Resize file list"
            onDrag={resizeFiles}
            onReset={() => onFilesHeight(150)}
          />
          <div className="diff-wrap">
            {loading ? <p className="muted pad">Loading diff…</p> : <DiffView text={error ?? diff} />}
          </div>
        </>
      ) : (
        <div className="empty-detail">Select a commit to see its message and diff.</div>
      )}
    </aside>
  )
}

function coAuthorNames(body: string): string[] {
  return body.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^co-authored-by:\s*(.+?)\s*<[^>]+>\s*$/i)
    return match?.[1] ? [match[1]] : []
  })
}

function commitBody(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^co-authored-by:\s*/i.test(line))
    .join('\n')
    .trim()
}
