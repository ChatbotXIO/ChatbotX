import { isBotMessageQuotaReached } from "../../../lib/is-bot-message-quota-reached"
import { logger } from "../../../lib/logger"

/** Error Logs detail for a private reply the bot message quota blocked. */
export const PRIVATE_REPLY_QUOTA_REACHED_ERROR =
  "Private reply not sent: Bot message limit reached"

/**
 * Whether the workspace owner's bot message quota blocks a private reply.
 *
 * A `text` or `AIAgent` private reply goes straight out through the
 * comment-anchored Send API, never through the chat worker, so the chat
 * worker's quota gate never sees it. It is checked here instead, before the
 * DM is sent or queued. A `flow` reply is checked too, so a blocked one is
 * recorded the same way rather than spending the comment's single DM.
 *
 * Fail-open on a lookup error, like the chat worker's gate on a job with no
 * owner: a quota read that breaks must not silence every private reply.
 */
export async function isPrivateReplyQuotaReached(
  workspaceId: string,
): Promise<boolean> {
  try {
    return await isBotMessageQuotaReached(workspaceId)
  } catch (err) {
    logger.error(
      { err, workspaceId },
      "Failed to check the bot message quota for a private reply",
    )
    return false
  }
}
