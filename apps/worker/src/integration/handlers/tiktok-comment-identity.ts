import { buildContext } from "@chatbotx.io/business"
import {
  integration as integrationTiktok,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import { logger } from "../../lib/logger"

export type TiktokCommenterIdentity = {
  displayName?: string
  username?: string
  avatarUrl?: string
  /** True when the comment was written by the connected account itself. */
  isOwner: boolean
  /**
   * Non-expiring URL of the image in the comment. TikTok documents it only as
   * "returned if the comment is an image"; whether a GIF comment carries one
   * is unverified — the `comment.update` webhook for a GIF has text only.
   */
  imageUrl?: string
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
 * response. That return means "authorship unknown", NOT "an ordinary
 * commenter": `receiveComment` still ingests the comment — a missing display
 * name must not cost the inbox a comment — but withholds the automation, since
 * answering a comment that might be the business's own would have the account
 * replying to itself. Every failure is therefore a warning and never a throw;
 * the caller decides what an unanswered lookup is worth, not this function.
 *
 * Goes through `runAction` so the SDK refreshes an expiring token first and
 * retries once when TikTok rejects it. Calling the API with the stored token
 * directly meant an expired token was never refreshed here, and since a
 * withheld automation sends nothing, no other call refreshed it either (#1754).
 */
export async function resolveTiktokCommenterIdentity(props: {
  workspaceId: string
  integrationRow: { id: string; inboxId: string; auth: TiktokAuthValue }
  commentId: string
  videoId: string
}): Promise<TiktokCommenterIdentity | undefined> {
  try {
    const ctx = await buildContext({
      workspaceId: props.workspaceId,
      integrationType: "tiktok",
      integration: props.integrationRow,
    })
    const result = await integrationTiktok.runAction("listComments", {
      ctx,
      input: {
        videoId: props.videoId,
        commentIds: [props.commentId],
        status: "ALL",
        maxCount: 1,
      },
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
      imageUrl: comment.image_url || undefined,
    }
  } catch (err) {
    logger.warn(
      { err, commentId: props.commentId, videoId: props.videoId },
      "resolveTiktokCommenterIdentity: lookup failed, falling back to webhook data",
    )
    return
  }
}
