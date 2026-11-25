import { socialPostFeedRepository } from "@chatbotx.io/database/repositories"
import {
  PostPublishJobAction,
  postFeedJobId,
  postPublishQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { POST_FEED_SCAN_BATCH, POST_FEED_SCAN_BUDGET_MS } from "./limits"

/** The job priority of a feed check: BullMQ runs jobs without a priority first, so a check never waits ahead of a publish job. */
const FEED_JOB_PRIORITY = 100

/** Makes an active feed due at once; a failure is logged, the next tick or edit reschedules it. */
export const markFeedDueAgain = async (
  feedId: string,
  workspaceId: string,
  unleasedOnly = false,
): Promise<void> => {
  try {
    await socialPostFeedRepository.markDue({
      id: feedId,
      now: new Date(),
      unleasedOnly,
      workspaceId,
    })
  } catch (err) {
    logger.warn({ err, feedId }, "social-post feed: failed to make due again")
  }
}

/** Whether a check of this feed is already waiting or running (its job id is taken). */
export const isFeedCheckQueued = async (feedId: string): Promise<boolean> =>
  (await postPublishQueue.getJob(postFeedJobId(feedId))) !== undefined

/**
 * Queues one check and says whether it was added. The job id is fixed per
 * feed and BullMQ drops a duplicate without an error or a signal (`add`
 * returns the id either way), so the job is looked up right before it is added:
 * `false` means one is already waiting or running. Throws when the queue
 * refuses: the caller decides what that means.
 */
export const enqueueFeedCheck = async (
  feedId: string,
  workspaceId: string,
): Promise<boolean> => {
  if (await isFeedCheckQueued(feedId)) {
    return false
  }
  await postPublishQueue.add(
    PostPublishJobAction.runFeed,
    {
      data: { feedId, workspaceId },
      type: PostPublishJobAction.runFeed,
    },
    { jobId: postFeedJobId(feedId), priority: FEED_JOB_PRIORITY },
  )
  return true
}

/**
 * One scan tick: hands the due feeds to the queue, batch after batch, until
 * none is due or the tick's time budget is spent (the next tick goes on).
 * Returns how many were queued.
 *
 * `claimDue` already moved every claimed feed one interval ahead. A feed whose
 * check is still waiting or running keeps that date: the queued check does the
 * work, and marking the feed due again would re-queue it right after every
 * finish so a backlog never drains.
 */
export const scanDueFeeds = async (now: Date = new Date()): Promise<number> => {
  const startedAt = Date.now()
  let queued = 0
  for (;;) {
    const due = await socialPostFeedRepository.claimDue({
      limit: POST_FEED_SCAN_BATCH,
      now,
    })
    let failed = 0
    for (const feed of due) {
      try {
        if (await enqueueFeedCheck(feed.id, feed.workspaceId)) {
          queued += 1
        }
      } catch (err) {
        failed += 1
        logger.warn(
          { err, feedId: feed.id },
          "social-post feed: failed to enqueue the job",
        )
        // The claim moved the feed an interval ahead; it is due again at the next tick instead.
        await markFeedDueAgain(feed.id, feed.workspaceId)
      }
    }
    if (failed > 0 && failed === due.length) {
      // The queue refuses everything: claiming more feeds would only reschedule them.
      logger.error(
        { failed },
        "social-post feed: the queue refused every job of a batch, the due scan stopped",
      )
      return queued
    }
    if (due.length < POST_FEED_SCAN_BATCH) {
      return queued
    }
    if (Date.now() - startedAt > POST_FEED_SCAN_BUDGET_MS) {
      logger.warn(
        { queued },
        "social-post feed: the due scan used its time budget, the rest waits for the next tick",
      )
      return queued
    }
  }
}
