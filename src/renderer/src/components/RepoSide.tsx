import type { BranchInfo, PullRequest, TagInfo } from '@shared/types'
import { BranchList } from './BranchList'
import { PullRequestList } from './PullRequestList'
import { TagList } from './TagList'

export type SideTab = 'branches' | 'tags' | 'pulls'

export function RepoSide({
  tab,
  onTab,
  branches,
  tags,
  head,
  detached,
  pulls,
  pullDetail,
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
}: {
  tab: SideTab
  onTab: (tab: SideTab) => void
  branches: BranchInfo[]
  tags: TagInfo[]
  head: string | null
  detached: boolean
  pulls: PullRequest[]
  pullDetail: string | null
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
      </div>
      <div className="sidebar-body">
        {tab === 'branches' && (
          <BranchList branches={branches} busy={busy} onCheckout={onCheckout} onNewBranch={onNewBranch} onDelete={onDeleteBranch} />
        )}
        {tab === 'tags' && (
          <TagList
            tags={tags}
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
