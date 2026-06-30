type WithId = { id: string }

/**
 * A stable, order-independent fingerprint of the flow's structure: the set of
 * node ids plus the set of edge ids. It changes only when a node/edge is added
 * or removed, not when a node is dragged or its content is edited.
 */
export const getFlowStructureSignature = (
  nodes: readonly WithId[],
  edges: readonly WithId[],
): string => {
  const nodeIds = nodes
    .map((node) => node.id)
    .sort()
    .join(",")
  const edgeIds = edges
    .map((edge) => edge.id)
    .sort()
    .join(",")

  return `n:${nodeIds}|e:${edgeIds}`
}
