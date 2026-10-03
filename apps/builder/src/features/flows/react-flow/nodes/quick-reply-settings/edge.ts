import {
  type QuickReplyNextStep,
  quickReplyNextStepFollowsEdge,
} from "@chatbotx.io/flow-config"

export type QuickReplySettingsSectionName =
  | "quickReplySettings.followUp"
  | "quickReplySettings.retry"

export type QuickReplySettingsEdge =
  | { kind: "edge"; targetNodeId: string }
  | { kind: "none" }

/**
 * Where a settings section's canvas edge should point, or `null` when the
 * section has no id yet (a node saved before this feature, before the dialog
 * first opens) and there is nothing to sync.
 *
 * There is no "keep a hand-drawn edge" case: a canvas connect always writes a
 * startAnotherNode target into the section, so an edge the canvas made is
 * already described by `target`.
 */
export const resolveQuickReplySettingsEdge = ({
  active,
  enabled,
  handleId,
  target,
}: {
  /** False when the section cannot run: no quick replies, or Retry next to Get User Data. */
  active: boolean
  enabled: boolean | undefined
  handleId: string | undefined
  target: QuickReplyNextStep | null | undefined
}): QuickReplySettingsEdge | null => {
  if (!handleId) {
    return null
  }
  const targetNodeId =
    target && "nodeId" in target.beforeStep ? target.beforeStep.nodeId : null

  return active &&
    enabled &&
    target &&
    quickReplyNextStepFollowsEdge(target) &&
    targetNodeId
    ? { kind: "edge", targetNodeId }
    : { kind: "none" }
}

/**
 * Whether the canvas already matches `desired`, so the sync can skip
 * `setEdges` entirely. An edge the canvas drew keeps its own id; matching on
 * handle, source and target is enough, so the sync never churns after a
 * canvas connect.
 */
export const isQuickReplySettingsEdgeInSync = (
  edges: readonly {
    source: string
    target: string
    sourceHandle?: string | null
  }[],
  {
    handleId,
    nodeId,
    desired,
  }: { handleId: string; nodeId: string; desired: QuickReplySettingsEdge },
): boolean => {
  const handleEdges = edges.filter((edge) => edge.sourceHandle === handleId)
  if (desired.kind === "none") {
    return handleEdges.length === 0
  }

  const [only] = handleEdges
  return (
    handleEdges.length === 1 &&
    only?.source === nodeId &&
    only.target === desired.targetNodeId
  )
}
