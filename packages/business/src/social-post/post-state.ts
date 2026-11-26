import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  socialPostPublishRepository,
  socialPostSchedulingRepository,
} from "@chatbotx.io/database/repositories"
import { computePostStatus } from "./post-status"

/**
 * Recomputes a post's state from its targets, under the post's row lock. Every
 * transaction that changes a target's state ends with it, so the post always
 * agrees with its targets. Returns `false` when the post is gone.
 */
export const recomputePostInTx = async (
  tx: DatabaseClient,
  socialPostId: string,
  workspaceId: string,
  now: Date = new Date(),
): Promise<boolean> => {
  const post = await socialPostPublishRepository.lockPost(
    { id: socialPostId, workspaceId },
    tx,
  )
  if (!post) {
    return false
  }
  const statuses = await socialPostPublishRepository.listTargetStatuses(
    { socialPostId, workspaceId },
    tx,
  )
  const waiting = await socialPostSchedulingRepository.countWaiting(
    { now, socialPostId, workspaceId },
    tx,
  )
  const next = computePostStatus(statuses, post.status, waiting > 0)
  await socialPostPublishRepository.setPostStatus(
    {
      completedAt: next.completed ? now : null,
      id: socialPostId,
      status: next.status,
      workspaceId,
    },
    tx,
  )
  return true
}
