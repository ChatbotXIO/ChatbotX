import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import type { ChatJobCommentModeration } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"

/**
 * Awaits a moderation hide/delete call and settles its `CommentModerationLog`
 * row: `done` on success, `failed` with the error on a throw — which is then
 * re-thrown so BullMQ still retries. A later successful attempt overwrites the
 * `failed`. Without `moderation` (an inbox action, an unhide) it only awaits.
 */
export async function settleCommentModeration(
  workspaceId: string,
  moderation: ChatJobCommentModeration | undefined,
  work: Promise<unknown>,
): Promise<void> {
  if (!moderation) {
    await work
    return
  }
  try {
    await work
  } catch (err) {
    await failCommentModeration(
      workspaceId,
      moderation,
      normalizeError(err).message,
    )
    throw err
  }
  await commentAutomationAnalyticsService.settleModeration({
    workspaceId,
    ...moderation,
    status: "done",
  })
}

export async function failCommentModeration(
  workspaceId: string,
  moderation: ChatJobCommentModeration | undefined,
  errorDetail: string,
): Promise<void> {
  if (!moderation) {
    return
  }
  await commentAutomationAnalyticsService.settleModeration({
    workspaceId,
    ...moderation,
    status: "failed",
    errorDetail,
  })
}
