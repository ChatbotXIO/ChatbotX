import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { listTiktokComments } from "@chatbotx.io/integration-tiktok/apis/comment"
import { logger } from "../../lib/logger"

export type TiktokCommenterIdentity = {
  displayName?: string
  username?: string
  avatarUrl?: string
  /** True when the comment was written by the connected account itself. */
  isOwner: boolean
}

/**
 * Fills in who wrote a TikTok comment.
 *
 * The `comment.update` webhook carries no name, handle or avatar — only a
 * `unique_identifier` — so a contact built from the webhook alone would show in
 * the inbox as an opaque id. `business/comment/list/` accepts a `comment_ids`
 * filter, which turns that into one lookup per comment.
 *
 * It also answers a question the webhook cannot: `owner` says whether the
 * business wrote the comment itself. `receiveComment`'s usual self-authored
 * check compares the commenter id against the integration identifier, and on
 * TikTok those are different id spaces (`unique_identifier` vs `open_id`), so
 * they would never match and the account would end up replying to itself.
 *
 * Returns `undefined` when the lookup fails or the comment is not in the
 * response. A missing name is worth degrading over; it must not stop the
 * comment reaching the inbox, so every failure is a warning, never a throw.
 */
export async function resolveTiktokCommenterIdentity(props: {
  auth: TiktokAuthValue
  commentId: string
  videoId: string
}): Promise<TiktokCommenterIdentity | undefined> {
  try {
    const result = await listTiktokComments(props.auth.tokens.accessToken, {
      businessId: props.auth.metadata.openId,
      videoId: props.videoId,
      commentIds: [props.commentId],
      status: "ALL",
      maxCount: 1,
    })

    const comment = result.comments?.find(
      (entry) => entry.comment_id === props.commentId,
    )
    if (!comment) {
      logger.warn(
        { commentId: props.commentId, videoId: props.videoId },
        "resolveTiktokCommenterIdentity: comment not returned by TikTok",
      )
      return
    }

    return {
      displayName: comment.display_name || comment.username,
      username: comment.username,
      avatarUrl: comment.profile_image,
      isOwner: comment.owner === true,
    }
  } catch (err) {
    logger.warn(
      { err, commentId: props.commentId, videoId: props.videoId },
      "resolveTiktokCommenterIdentity: lookup failed, falling back to webhook data",
    )
    return
  }
}
