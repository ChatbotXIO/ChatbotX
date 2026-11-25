import { distributedLock, distributedStore } from "@chatbotx.io/redis"
import { logger } from "../logger"

/** Long enough to outlive any queued like job; the counter is only compared among in-flight jobs. */
export const COMMENT_LIKE_SEQ_TTL_SECONDS = 24 * 60 * 60

type CommentLikeKeyProps = { commentId: string; workspaceId: string }

const commentLikeSeqKey = (props: CommentLikeKeyProps): string =>
  `postcomment:${props.workspaceId}:${props.commentId}:seq`

/** Longest a like/unlike job may hold the comment's lock (its provider call and attribute write). */
const COMMENT_LIKE_LOCK_TTL_SECONDS = 60
/** How long a later job waits for an earlier one before failing and retrying. */
const COMMENT_LIKE_LOCK_WAIT_SECONDS = 120

const commentLikeLockKey = (props: CommentLikeKeyProps): string =>
  `postcomment:${props.workspaceId}:${props.commentId}:like-lock`

/**
 * Orders the like/unlike jobs of one comment. The chat worker runs jobs
 * concurrently, so a slow earlier "like" could finish after a later "unlike"
 * and leave the channel liked. Each enqueue takes the next number; a job whose
 * number is below the latest is stale and must not reach the provider.
 *
 * Best-effort: a Redis error is logged and never thrown. No number means the
 * job is unfenced and always applies, which is the behavior before the fence.
 */
export const commentLikeFence = {
  async next(props: CommentLikeKeyProps): Promise<number | undefined> {
    try {
      return await distributedStore.incrWithWindow(
        commentLikeSeqKey(props),
        COMMENT_LIKE_SEQ_TTL_SECONDS,
      )
    } catch (err) {
      logger.warn(
        { err, commentId: props.commentId },
        "commentLikeFence.next: Redis write failed, like job is unfenced",
      )
      return
    }
  },

  /**
   * Runs one like/unlike job's check, provider call and attribute write alone
   * for its comment. The sequence check alone cannot stop an older like that
   * passed it and then paused: with the lock, a newer job waits for it, and an
   * older job that enters after a newer one re-reads the counter and is stale.
   * Unfenced jobs (no number) run as they did before the fence. A lock that
   * cannot be taken throws, so the job retries rather than racing.
   */
  async serialize<T>(
    props: CommentLikeKeyProps & { seq: number | undefined },
    fn: () => Promise<T>,
  ): Promise<T> {
    if (props.seq === undefined) {
      return await fn()
    }
    return await distributedLock.runExclusive({
      fn,
      key: commentLikeLockKey(props),
      retryTimeoutInSeconds: COMMENT_LIKE_LOCK_WAIT_SECONDS,
      timeoutInSeconds: COMMENT_LIKE_LOCK_TTL_SECONDS,
    })
  },

  /** False only when a later like/unlike of the same comment has been queued. */
  async isLatest(
    props: CommentLikeKeyProps & { seq: number | undefined },
  ): Promise<boolean> {
    if (props.seq === undefined) {
      return true
    }
    try {
      const latest = await distributedStore.getNumber(commentLikeSeqKey(props))
      return latest === null || latest <= props.seq
    } catch (err) {
      logger.warn(
        { err, commentId: props.commentId },
        "commentLikeFence.isLatest: Redis check failed, applying the job",
      )
      return true
    }
  },
}
