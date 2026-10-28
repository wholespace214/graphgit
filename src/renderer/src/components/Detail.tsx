import type { Commit, FileChange } from '@shared/types'
import { formatWhen, shortHash } from '../format'
import { DiffView } from './DiffView'
import { StatusBadge } from './StatusBadge'

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
  onSelectFile,
  onCopy,
}: {
  panel: 'commit' | 'work'
  loading: boolean
  error: string | null
  commit: Commit | null
  files: FileChange[]
  body: string
  activeFile: string | null
  diff: string
  workPath: string | null
  workStaged: boolean
  onSelectFile: (path: string) => void
  onCopy: (text: string) => void
}) {
  return (
    <aside className="detail">
      {panel === 'work' && workPath ? (
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
              {commit.author} · {formatWhen(commit.time)}
            </p>
            <button className="hash-button mono" onClick={() => onCopy(commit.hash)} title="Copy hash">
              {commit.hash}
            </button>
            {commit.parents.length > 1 && (
              <p className="parents">Merge of {commit.parents.map((parent) => shortHash(parent)).join(' + ')}</p>
            )}
            {body && <pre className="commit-body">{body}</pre>}
          </div>
          <div className="file-list">
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
