import type { Commit } from './types'

export const LANE_WIDTH = 16
export const ROW_HEIGHT = 36

export const LANE_COLORS = [
  '#6cb6ff',
  '#3ee0a2',
  '#f0c14a',
  '#ff8ec7',
  '#c792ea',
  '#ff9f6b',
  '#5ad7d1',
  '#ff7b72',
]

export function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length] ?? LANE_COLORS[0]
}

export type GraphEdge = { from: number; to: number }

export type GraphRow = {
  commit: Commit
  col: number
  edges: GraphEdge[]
  input: (string | null)[]
  output: (string | null)[]
}

export function layoutCommits(commits: Commit[]): GraphRow[] {
  const active: (string | null)[] = []
  const rows: GraphRow[] = []

  for (const commit of commits) {
    let col = active.indexOf(commit.hash)
    if (col === -1) {
      col = active.indexOf(null)
      if (col === -1) {
        col = active.length
        active.push(commit.hash)
      } else {
        active[col] = commit.hash
      }
    }

    const input = active.slice()
    active[col] = null
    const edges: GraphEdge[] = []

    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex++) {
      const parent = commit.parents[parentIndex]
      if (!parent) continue
      let target = active.indexOf(parent)
      if (target === -1) {
        if (parentIndex === 0 && active[col] === null) {
          target = col
        } else {
          target = active.indexOf(null)
          if (target === -1) {
            target = active.length
            active.push(parent)
          }
        }
        active[target] = parent
      }
      edges.push({ from: col, to: target })
    }

    while (active.length > 0 && active[active.length - 1] === null) active.pop()

    rows.push({
      commit,
      col,
      edges,
      input,
      output: active.slice(),
    })
  }

  return rows
}
