import type { FlowNode } from "@chatbotx.io/flow-config"
import type { ReactFlowState } from "@xyflow/react"

// Select only the selected node from the store
export const selectSelectedNode = (state: ReactFlowState): FlowNode | null =>
  (state.nodes.find((node) => node.selected) as FlowNode) || null

// Re-render the detail sheet only when the selected node's identity or its
// display name changes. The big editor form below streams its keystrokes into
// `data.details`; ignoring those here keeps the form from re-seeding while the
// user types. A rename is a discrete, explicit change we DO want to surface so
// the sheet title (NodeNameEditor) syncs immediately instead of waiting for a
// full remount (F5).
export const selectedNodeEqualityFn = (
  a: FlowNode | null,
  b: FlowNode | null,
): boolean => {
  if (a === b) {
    return true
  }
  return a?.id === b?.id && a?.data.name === b?.data.name
}
