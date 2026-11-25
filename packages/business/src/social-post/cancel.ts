import { db } from "@chatbotx.io/database/client"
import {
  socialPostPublishRepository,
  socialPostSchedulingRepository,
} from "@chatbotx.io/database/repositories"
import { recomputePostInTx } from "./post-state"

/**
 * Cancels a scheduled post: every pending target becomes `cancelled`, its queue
 * slot is freed in the same statement, and the post follows its targets (all
 * cancelled: `cancelled`). `false` when the post is not scheduled, or nothing
 * was left to cancel (every target is already running or done). Allowed in a
 * trial-expired workspace: it only takes work away.
 */
export const cancelScheduledPost = async (input: {
  id: string
  workspaceId: string
}): Promise<boolean> =>
  await db.transaction(async (tx) => {
    const { id, workspaceId } = input
    const post = await socialPostPublishRepository.lockPost(
      { id, workspaceId },
      tx,
    )
    if (post?.status !== "scheduled") {
      return false
    }
    await socialPostSchedulingRepository.lockPostDestinations(
      { socialPostId: id, workspaceId },
      tx,
    )
    const cancelled = await socialPostSchedulingRepository.cancelPending(
      { socialPostId: id, workspaceId },
      tx,
    )
    if (cancelled === 0) {
      return false
    }
    await recomputePostInTx(tx, id, workspaceId)
    return true
  })
