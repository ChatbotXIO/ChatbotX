import { buildContext, tiktokIntegrationService } from "@chatbotx.io/business"
import {
  integration as integrationTiktok,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import {
  IntegrationJobAction,
  type IntegrationJobReceiveComment,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

/**
 * When a withheld comment is looked up again, counted from the previous try.
 * A comment can be missing from `business/comment/list/` for a moment right
 * after its webhook (on photo posts TikTok reports `set_to_public` about a
 * second later, #1715), so the first re-check comes quickly and the last one
 * a few minutes in.
 */
export const TIKTOK_IDENTITY_RECHECK_DELAYS_MS = [5000, 30_000, 120_000]

/**
 * Records the account's own `unique_identifier` the first time a lookup proves
 * a comment is the account's (and again if it ever changes). Best effort: a
 * failure only delays learning it until the next own comment.
 */
export async function rememberTiktokOwnerIdentifier(props: {
  integrationRow: { id: string; auth: TiktokAuthValue }
  workspaceId: string
  uniqueIdentifier: string
}): Promise<void> {
  if (
    props.integrationRow.auth.metadata?.ownerUniqueIdentifier ===
    props.uniqueIdentifier
  ) {
    return
  }
  try {
    await tiktokIntegrationService.rememberOwnerUniqueIdentifier({
      id: props.integrationRow.id,
      workspaceId: props.workspaceId,
      uniqueIdentifier: props.uniqueIdentifier,
    })
  } catch (err) {
    logger.warn(
      { err, integrationId: props.integrationRow.id },
      "rememberTiktokOwnerIdentifier: unable to store the account's unique_identifier",
    )
  }
}

type TiktokCommentData = IntegrationJobReceiveComment["data"]["commentData"]

/**
 * The comment a re-check should run on: the one stored when its automation
 * was withheld, or `undefined` when there is nothing left to re-check — it
 * was never withheld (an old comment the shop un-hides), or an earlier run
 * already settled it. The stored copy is used rather than the re-check's own
 * payload because `set_to_public` may not carry the comment text.
 */
export async function findTiktokCommentToRecheck(props: {
  integrationIdentifier: string
  commentId: string
}): Promise<TiktokCommentData | undefined> {
  try {
    const comment =
      await tiktokIntegrationService.findCommentIdentityWithheld<TiktokCommentData>(
        props,
      )
    return comment ?? undefined
  } catch (err) {
    logger.warn(
      { err, commentId: props.commentId },
      "findTiktokCommentToRecheck: unable to read the withheld mark, skipping the re-check",
    )
    return
  }
}

/** Ends the re-checks of a comment whose authorship is now settled. */
export async function settleTiktokRecheck(props: {
  integrationIdentifier: string
  commentId: string
}): Promise<void> {
  try {
    await tiktokIntegrationService.clearCommentIdentityWithheld(props)
  } catch (err) {
    // The re-checks still pending will run, find the comment already stored
    // and stop at the automation's jobId — wasted work, not a second reply.
    logger.warn(
      { err, commentId: props.commentId },
      "settleTiktokRecheck: unable to clear the withheld mark",
    )
  }
}

/**
 * Called when a comment's automation is withheld because its author is
 * unknown: marks the comment as withheld and schedules the next re-check of
 * the whole `incomingComment` job.
 *
 * Re-running the job is safe: the comment is already stored (it is not saved
 * or counted twice), post-comment triggers are claimed per comment, and the
 * automation job is keyed by comment id. A `set_to_public` run does not start
 * a new chain — the chain the first delivery started is still going.
 */
export async function withholdTiktokComment(
  props: IntegrationJobReceiveComment["data"],
): Promise<void> {
  const { integrationIdentifier, commentData, tiktokIdentityRecheck } = props
  const commentId = commentData.commentId

  try {
    await tiktokIntegrationService.markCommentIdentityWithheld({
      integrationIdentifier,
      commentId,
      comment: commentData,
    })
  } catch (err) {
    // A re-check without the mark would stop at once, so none is scheduled.
    logger.warn(
      { err, commentId },
      "withholdTiktokComment: unable to mark the comment, no re-check scheduled",
    )
    return
  }

  if (tiktokIdentityRecheck?.source === "visibility") {
    return
  }

  const attempt = (tiktokIdentityRecheck?.attempt ?? 0) + 1
  const delay = TIKTOK_IDENTITY_RECHECK_DELAYS_MS[attempt - 1]
  if (delay === undefined) {
    logger.warn(
      { commentId, attempts: TIKTOK_IDENTITY_RECHECK_DELAYS_MS.length },
      "withholdTiktokComment: commenter still unknown after every re-check, automation stays withheld",
    )
    return
  }

  await integrationQueue.add(
    IntegrationJobAction.incomingComment,
    {
      type: IntegrationJobAction.incomingComment,
      data: {
        ...props,
        tiktokIdentityRecheck: { source: "retry", attempt },
      },
    },
    {
      delay,
      // One job per comment and attempt: a redelivered webhook that is
      // withheld again does not start a second chain.
      jobId: `tiktok-identity-recheck-${commentId}-${attempt}`,
    },
  )
}

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
