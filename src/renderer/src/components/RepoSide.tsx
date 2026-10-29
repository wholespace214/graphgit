import type { BranchInfo, PullRequest, RemoteTag, StashEntry, TagInfo } from '@shared/types'
import { BranchList } from './BranchList'
import { PullRequestList } from './PullRequestList'
import { StashList } from './StashList'
import { TagList } from './TagList'

export type SideTab = 'branches' | 'tags' | 'pulls' | 'stash'

export function RepoSide({
  tab,
  onTab,
  branches,
  tags,
  remoteTags,
  remoteName,
  remoteDetail,
  remoteReady,
  head,
  detached,
  pulls,
  pullDetail,
  stashes,
  selectedStash,
  busy,
  canPush,
  onCheckout,
  onNewBranch,
  onDeleteBranch,
  onCheckoutTag,
  onNewTag,
  onDeleteTag,
  onPushTag,
  onCheckoutPull,
  onNewPull,
  onSelectStash,
  onNewStash,
  onApplyStash,
  onPopStash,
  onDropStash,
}: {
  tab: SideTab
  onTab: (tab: SideTab) => void
  branches: BranchInfo[]
  tags: TagInfo[]
  remoteTags: RemoteTag[]
  remoteName: string | null
  remoteDetail: string | null
  remoteReady: boolean
  head: string | null
  detached: boolean
  pulls: PullRequest[]
  pullDetail: string | null
  stashes: StashEntry[]
  selectedStash: string | null
  busy: boolean
  canPush: boolean
  onCheckout: (name: string) => void
  onNewBranch: () => void
  onDeleteBranch: (name: string) => void
  onCheckoutTag: (name: string) => void
  onNewTag: () => void
  onDeleteTag: (name: string) => void
  onPushTag: (name: string) => void
  onCheckoutPull: (number: number) => void
  onNewPull: () => void
  onSelectStash: (entry: StashEntry) => void
  onNewStash: () => void
  onApplyStash: (entry: StashEntry) => void
  onPopStash: (entry: StashEntry) => void
  onDropStash: (entry: StashEntry) => void
}) {
  return (
    <>
      <div className="side-tabs" role="tablist">
        <Tab id="branches" current={tab} onTab={onTab}>
          Branches
        </Tab>
        <Tab id="tags" current={tab} onTab={onTab}>
          Tags
        </Tab>
        <Tab id="pulls" current={tab} onTab={onTab}>
          PRs
        </Tab>
        <Tab id="stash" current={tab} onTab={onTab}>
          Stash
        </Tab>
      </div>
      <div className="sidebar-body">
        {tab === 'branches' && (
          <BranchList branches={branches} busy={busy} onCheckout={onCheckout} onNewBranch={onNewBranch} onDelete={onDeleteBranch} />
        )}
        {tab === 'tags' && (
          <TagList
            tags={tags}
            remoteTags={remoteTags}
            remoteName={remoteName}
            remoteDetail={remoteDetail}
            remoteReady={remoteReady}
            head={head}
            detached={detached}
            busy={busy}
            canPush={canPush}
            onCheckout={onCheckoutTag}
            onCreate={onNewTag}
            onDelete={onDeleteTag}
            onPush={onPushTag}
          />
        )}
        {tab === 'pulls' && (
          <PullRequestList requests={pulls} detail={pullDetail} busy={busy} onCheckout={onCheckoutPull} onCreate={onNewPull} />
        )}
        {tab === 'stash' && (
          <StashList
            stashes={stashes}
            selected={selectedStash}
            busy={busy}
            onSelect={onSelectStash}
            onCreate={onNewStash}
            onApply={onApplyStash}
            onPop={onPopStash}
            onDrop={onDropStash}
          />
        )}
      </div>
    </>
  )
}

function Tab({
  id,
  current,
  onTab,
  children,
}: {
  id: SideTab
  current: SideTab
  onTab: (tab: SideTab) => void
  children: string
}) {
  return (
    <button type="button" role="tab" aria-selected={current === id} className={current === id ? 'on' : ''} onClick={() => onTab(id)}>
      {children}
    </button>
  )
}
