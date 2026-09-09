import { flowService } from "@chatbotx.io/business"
import type { FBCommentReplyType } from "@chatbotx.io/database/partials"
import { logger } from "../../../lib/logger"

/**
 * What a reply branch actually dispatched. `null` from an executor means the
 * branch declined to send (type `none`, missing value, outside the private
 * reply window, anchor already claimed) — the caller treats that exactly as
 * the old `false` return did.
 *
 * `replyText` is the text the customer will see, which is also what the
 * analytics "Bot replies to comments" table groups on:
 * - `text`  — after variable substitution, i.e. what actually goes out
 * - `flow`  — the flow has no single text of its own, so its name stands in
 * - `AIAgent` — null here; the text does not exist until the AI job runs, and
 *   `processCommentAIReply` fills it in on the same event row
 */
export type CommentReplyOutcome = {
  replyType: FBCommentReplyType
  replyText: string | null
}

/**
 * Label for a flow reply in the analytics tables. Falls back to the raw id so a
 * deleted or cross-workspace flow still produces a readable, groupable row
 * rather than an empty cell.
 */
export async function describeFlowReply(props: {
  workspaceId: string
  flowId: string
}): Promise<string> {
  try {
    const flow = await flowService.findBy({
      workspaceId: props.workspaceId,
      id: props.flowId,
    })
    return `Flow: ${flow?.name ?? props.flowId}`
  } catch (err) {
    logger.warn(
      { err, workspaceId: props.workspaceId, flowId: props.flowId },
      "Failed to resolve flow name for comment automation analytics",
    )
    return `Flow: ${props.flowId}`
  }
}
