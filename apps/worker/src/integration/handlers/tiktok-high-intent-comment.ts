import type { IntegrationType } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationJobTiktokHighIntentComment } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"

/**
 * The key `receiveTiktokHighIntentComment` merges into the comment message's
 * `contentAttributes`, and the one the comment-automation private-reply gate
 * reads back. One jsonb key, merged DB-side, so it cannot clobber `postId` —
 * which `{{last_post_id}}` depends on.
 */
export const TIKTOK_HIGH_INTENT_ATTRIBUTE = "tiktokHighIntent"

export type TiktokHighIntentAttribute = {
  /** ISO-8601; when TikTok's classifier reported the comment, not when written. */
  at: string
  isFollower?: boolean
  /** Epoch seconds the comment was posted, for the 48-hour send window. */
  commentedAt: number
}

/**
 * Thrown when the comment this flag belongs to has not been ingested yet.
 *
 * TikTok delivers `comment.update` and `im_receive_high_intent_comment` on two
 * independent subscriptions with no ordering guarantee, so the classifier can
 * beat the comment itself. Thrown rather than swallowed so BullMQ retries the
 * job — its backoff is the only thing that converges the two — and so the final
 * give-up is visible instead of looking like a flag that silently never set.
 */
export class TiktokHighIntentCommentPendingError extends Error {
  constructor(commentId: string) {
    super(
      `tiktok-high-intent-comment-pending: comment ${commentId} has not been ingested yet`,
    )
    this.name = "TiktokHighIntentCommentPendingError"
  }
}

/**
 * Stamps TikTok's high-intent verdict onto the ingested comment.
 *
 * That flag is the whole point: Comment-to-Message only accepts a `comment_id`
 * TikTok itself flagged, so without it there is no way to tell a comment the
 * business may DM from one it may not. The event carries no post id, which is
 * why this correlates through the comment row rather than resolving an
 * automation here — the automation pass reads the flag back off the same row.
 *
 * Writing the flag is all it does. Sending is the automation's job, either
 * inline on a later `comment.update` pass or through the deferred private-reply
 * job when the comment was already processed.
 */
export const receiveTiktokHighIntentComment = async (
  props: IntegrationJobTiktokHighIntentComment["data"],
): Promise<void> => {
  const {
    integrationType,
    integrationIdentifier,
    commentId,
    isFollower,
    commentedAt,
  } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const repository = await createMessageRepository()
  const attribute: TiktokHighIntentAttribute = {
    at: new Date().toISOString(),
    isFollower,
    commentedAt,
  }

  const merged = await repository.mergeContentAttributesBySourceId(
    commentId,
    inbox.workspaceId,
    { [TIKTOK_HIGH_INTENT_ATTRIBUTE]: attribute },
  )

  if (!merged) {
    throw new TiktokHighIntentCommentPendingError(commentId)
  }

  logger.info(
    {
      commentId,
      workspaceId: inbox.workspaceId,
      messageId: merged.id,
      isFollower,
    },
    "Flagged a TikTok comment as high intent",
  )
}
