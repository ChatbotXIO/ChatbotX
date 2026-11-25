import type { MessageQuotaMarkerKey } from "@chatbotx.io/database/repositories"
import { logger } from "../logger"
import { messageService } from "../message/service"
import { messageUsageService } from "./service"

type ChargeCommentActionInput = {
  comment: { createdAt: Date; id: string }
  key: MessageQuotaMarkerKey
  workspaceId: string
}

/**
 * Charges one message for an action a per-post comment setting took on a
 * comment (a hide the provider accepted, a skip that advanced the read mark),
 * at most once per comment and action.
 *
 * The comment carries a strict marker that is claimed first and then charged;
 * when the charge fails the marker is released and the error is rethrown, so a
 * retry charges again and never twice. The release only helps a caller that
 * retries with the same gate (the hide job); a caller that drops the error
 * (the skip path) loses that charge. A crash between the claim and the charge
 * can lose that one charge, never double it. Returns whether this call charged.
 */
export async function chargeCommentActionOnce(
  input: ChargeCommentActionInput,
): Promise<boolean> {
  const marker = {
    createdAt: input.comment.createdAt,
    id: input.comment.id,
    key: input.key,
    workspaceId: input.workspaceId,
  }
  const claimed = await messageService.claimQuotaMarker(marker)
  if (!claimed) {
    return false
  }
  try {
    await messageUsageService.charge({
      count: 1,
      workspaceId: input.workspaceId,
    })
  } catch (err) {
    logger.error(
      { err, key: input.key, messageId: input.comment.id },
      "comment action message charge failed, releasing the marker",
    )
    try {
      await messageService.releaseQuotaMarker(marker)
    } catch (releaseErr) {
      logger.error(
        { err: releaseErr, key: input.key, messageId: input.comment.id },
        "comment action quota marker release failed",
      )
    }
    throw err
  }
  return true
}
