import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "../../../lib/logger"

/**
 * A post stays known-live for the whole private-reply window: comments keep
 * arriving on the replay after the broadcast ends, and Meta still accepts a
 * private reply to them for 7 days.
 */
const LIVE_POST_TTL_SECONDS = 7 * 24 * 60 * 60

const livePostKey = (integrationId: string, postId: string) =>
  `comment-live-post:${integrationId}:${postId}`

/**
 * Decides whether a Facebook comment was made on a live broadcast.
 *
 * Instagram needs none of this — its `live_comments` webhook field says so.
 * Facebook delivers a live comment as an ordinary `feed` comment, so the
 * answer comes from the comment's `live_broadcast_timestamp`, read by the
 * attachment lookup `receiveComment` already makes (`lookupIsLive`).
 *
 * The post is remembered once any of its comments is known live. That keeps
 * the answer right when a lookup fails mid-burst (`lookupIsLive` undefined —
 * Graph rate limits hit hardest exactly during a busy live) and for a comment
 * left on the replay, which may carry no broadcast timestamp. Getting this
 * wrong is not harmless either way: a live comment read as ordinary is
 * answered by the `all` automations instead of the Live ones.
 */
export async function resolveLiveComment(params: {
  integrationId: string
  postId: string
  /** Undefined when the Graph lookup failed. */
  lookupIsLive: boolean | undefined
}): Promise<boolean> {
  const { integrationId, postId, lookupIsLive } = params
  const key = livePostKey(integrationId, postId)

  if (lookupIsLive) {
    await distributedStore
      .put(key, true, LIVE_POST_TTL_SECONDS)
      .catch((err: unknown) => {
        logger.warn(
          { err, integrationId, postId },
          "resolveLiveComment: failed to remember live post",
        )
      })
    return true
  }

  const known = await distributedStore
    .get<boolean>(key)
    .catch((err: unknown) => {
      logger.warn(
        { err, integrationId, postId },
        "resolveLiveComment: failed to read live post cache",
      )
      return null
    })
  if (known) {
    return true
  }

  if (lookupIsLive === undefined) {
    logger.warn(
      { integrationId, postId },
      "resolveLiveComment: live status unknown, treating comment as a regular post comment",
    )
  }
  return false
}
