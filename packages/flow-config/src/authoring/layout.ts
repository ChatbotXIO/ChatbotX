import { DEFAULT_NODE_MEASURED } from "../nodes/base"
import type { EdgeSchema } from "../nodes/index"

// Every node type uses the same default footprint, so layout can use one fixed
// cell size instead of asking each node for its own.
const NODE_WIDTH = DEFAULT_NODE_MEASURED.width
const NODE_HEIGHT = DEFAULT_NODE_MEASURED.height
const COLUMN_GAP = 120
const ROW_GAP = 80
const COLUMN_WIDTH = NODE_WIDTH + COLUMN_GAP
const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP
const ORIGIN = { x: 100, y: 100 }

export type LayoutPosition = { x: number; y: number }

/**
 * Deterministic column-by-depth, row-by-branch layout: BFS from the start
 * node assigns each node's column to its BFS depth and its row to the order
 * it was first reached within that depth. Same `nodeIds`/`edges`/`startNodeId`
 * always produce the same positions — required for the compiler's golden
 * snapshot tests, and generally desirable so re-compiling the same spec
 * doesn't jitter node positions.
 */
export function layoutNodes(
  nodeIds: readonly string[],
  edges: readonly Pick<EdgeSchema, "source" | "target">[],
  startNodeId: string,
): Map<string, LayoutPosition> {
  const childrenBySource = new Map<string, string[]>()
  for (const edge of edges) {
    const children = childrenBySource.get(edge.source)
    if (children) {
      children.push(edge.target)
    } else {
      childrenBySource.set(edge.source, [edge.target])
    }
  }

  const positions = new Map<string, LayoutPosition>()
  const rowCountByDepth = new Map<number, number>()

  const place = (nodeId: string, depth: number): void => {
    if (positions.has(nodeId)) {
      return
    }
    const row = rowCountByDepth.get(depth) ?? 0
    rowCountByDepth.set(depth, row + 1)
    positions.set(nodeId, {
      x: ORIGIN.x + depth * COLUMN_WIDTH,
      y: ORIGIN.y + row * ROW_HEIGHT,
    })
  }

  // BFS from the start node — depth doubles as column index, and visiting
  // order within a depth doubles as row index, matching "row by branch".
  let frontier = [startNodeId]
  let depth = 0
  const visited = new Set<string>()
  while (frontier.length > 0) {
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      if (visited.has(nodeId)) {
        continue
      }
      visited.add(nodeId)
      place(nodeId, depth)
      for (const child of childrenBySource.get(nodeId) ?? []) {
        if (!visited.has(child)) {
          nextFrontier.push(child)
        }
      }
    }
    frontier = nextFrontier
    depth += 1
  }

  // A node unreachable from the start should not happen for a spec the
  // compiler produced by construction, but every node still gets a position
  // (appended after every reachable column) rather than silently missing one.
  let fallbackDepth = depth
  for (const nodeId of nodeIds) {
    if (!positions.has(nodeId)) {
      place(nodeId, fallbackDepth)
      fallbackDepth += 1
    }
  }

  return positions
}
