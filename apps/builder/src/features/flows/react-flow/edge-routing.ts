import type { FlowRouteUpdate } from "@chatbotx.io/flow-config"
import { addEdge, type Connection, type Edge } from "@xyflow/react"

type NextButtonEdge = Connection & Partial<Pick<Edge, "id" | "type">>

export const replaceSourceHandleEdge = (
  edges: Edge[],
  nextEdge: NextButtonEdge,
): Edge[] => {
  const isAlreadyConnected = edges.some(
    (edge) =>
      edge.source === nextEdge.source &&
      edge.sourceHandle === nextEdge.sourceHandle &&
      edge.target === nextEdge.target &&
      edge.targetHandle === nextEdge.targetHandle,
  )
  if (isAlreadyConnected) {
    return edges
  }

  const edgesFromOtherHandles = edges.filter(
    (edge) =>
      edge.source !== nextEdge.source ||
      edge.sourceHandle !== nextEdge.sourceHandle,
  )

  return addEdge(nextEdge, edgesFromOtherHandles)
}

/**
 * Resolves the button whose route a source handle owns, or `null` when the
 * handle owns none.
 *
 * A node's continue handle reuses the node id and is routed by its edge alone,
 * so only a handle carrying an id of its own writes into node data.
 */
export const getRoutableHandleId = (
  sourceNodeId: string,
  sourceHandleId: string | null | undefined,
): string | null =>
  sourceHandleId && sourceHandleId !== sourceNodeId ? sourceHandleId : null

/** Clears the button route behind every routable handle that lost its edge. */
export const toRouteRemovals = (edges: readonly Edge[]): FlowRouteUpdate[] =>
  edges.flatMap((edge) => {
    const handleId = getRoutableHandleId(edge.source, edge.sourceHandle)
    return handleId
      ? [{ sourceNodeId: edge.source, handleId, route: null }]
      : []
  })
