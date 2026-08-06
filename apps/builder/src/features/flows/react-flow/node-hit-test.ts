import type { Node, XYPosition } from "@xyflow/react"

type GetIntersectingNodes = (
  rect: { x: number; y: number; width: number; height: number },
  partially: boolean,
) => Node[]

/**
 * Finds which node (if any) fully contains the given point, excluding
 * `excludeNodeId`. Delegates the actual rect math to React Flow's own
 * `getIntersectingNodes` so it stays correct for nested/grouped nodes
 * (it compares against each node's absolute position, not just `node.position`).
 *
 * When multiple nodes overlap at the point, no explicit stacking order is
 * tracked for flow nodes today, so this prefers the highest `zIndex` and
 * falls back to the most recently added node as the best available proxy
 * for "visually on top".
 */
export function findNodeAtPoint(
  getIntersectingNodes: GetIntersectingNodes,
  point: XYPosition,
  excludeNodeId: string,
): Node | undefined {
  const candidates = getIntersectingNodes(
    { x: point.x, y: point.y, width: 1, height: 1 },
    false,
  ).filter((node) => node.id !== excludeNodeId)

  return candidates.reduce<Node | undefined>((topmost, candidate) => {
    if (!topmost) {
      return candidate
    }
    return (candidate.zIndex ?? 0) >= (topmost.zIndex ?? 0)
      ? candidate
      : topmost
  }, undefined)
}
