import {
  commentAutomationService,
  type MissedCommentsIneligibleReason,
  workspaceService,
} from "@chatbotx.io/business"
import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import {
  LowJobAction,
  type LowJobReplayMissedComment,
  lowQueue,
} from "@chatbotx.io/worker-config"
import { subDays } from "date-fns"
import { logger } from "@/lib/log"
import { scanPostComments } from "./index"
import {
  MISSED_COMMENTS_SCAN_DAYS,
  MissedCommentsIntegrationNotFoundError,
  type ScannedComment,
} from "./types"

/**
 * Gap between two replayed comments on one channel account. A run can hold
 * thousands of comments, and enqueueing them all at once would fire every reply
 * and DM in the same burst — hitting the channel's rate limits. Spacing them
 * mirrors the one-at-a-time pace of AhaChat's replay; the spacing is booked on
 * the account (`reserveMissedCommentsReplayWindow`), so concurrent runs on one
 * Page share it instead of multiplying it.
 */
const MISSED_COMMENTS_REPLAY_SPACING_MS = 1000

/** Jobs per `addBulk` call — one Redis round trip per chunk, not per comment. */
const MISSED_COMMENTS_ENQUEUE_CHUNK_SIZE = 500

type ReplayJob = {
  name: typeof LowJobAction.replayMissedComment
  data: LowJobReplayMissedComment
  opts: { jobId: string; delay: number; attempts: number }
}

export type ProcessMissedCommentsFailureReason =
  | MissedCommentsIneligibleReason
  | "workspaceInactive"
  | "alreadyRunning"
  | "integrationNotFound"
  | "fetchFailed"

export type ProcessMissedCommentsResult =
  | {
      status: "done"
      scanned: number
      skipped: number
      queued: number
      failed: number
    }
  | { status: "failed"; reason: ProcessMissedCommentsFailureReason }

/**
 * Replays the last `MISSED_COMMENTS_SCAN_DAYS` days of comments on an
 * automation's single post through that automation only.
 *
 * A comment counts as handled when this automation already has an event or a
 * miss row for it; everything else is enqueued on the `low` queue, oldest
 * first, and ingested there through the live webhook path (`receiveComment`).
 * Sends and replies are real — the caller confirms that before calling.
 */
export async function processMissedComments(props: {
  workspaceId: string
  id: string
}): Promise<ProcessMissedCommentsResult> {
  const target =
    await commentAutomationService.resolveMissedCommentsTarget(props)
  if (!target.eligible) {
    return { status: "failed", reason: target.reason }
  }

  // The worker drops a comment for a workspace that is off or outside its
  // active hours without a word, so a run then would scan and send nothing.
  const workspace = await workspaceService.findById({ id: props.workspaceId })
  if (!workspaceService.isActiveNow(workspace)) {
    return { status: "failed", reason: "workspaceInactive" }
  }

  const { automation, channelType, postId } = target
  if (!(await commentAutomationService.claimMissedCommentsRun(automation.id))) {
    return { status: "failed", reason: "alreadyRunning" }
  }

  try {
    let comments: ScannedComment[]
    try {
      comments = await scanPostComments({
        type: channelType,
        workspaceId: props.workspaceId,
        postId,
        since: subDays(new Date(), MISSED_COMMENTS_SCAN_DAYS),
      })
    } catch (error) {
      if (error instanceof MissedCommentsIntegrationNotFoundError) {
        return { status: "failed", reason: "integrationNotFound" }
      }
      logger.warn(
        { err: error, automationId: automation.id, postId },
        "Process missed comments: fetching the post's comments failed",
      )
      return { status: "failed", reason: "fetchFailed" }
    }

    const processed = await commentAutomationService.findProcessedCommentIds({
      automationId: automation.id,
      commentIds: comments.map((comment) => comment.commentData.commentId),
    })
    const pending = comments
      .filter((comment) => !processed.has(comment.commentData.commentId))
      .sort(
        (left, right) =>
          left.commentData.createdTime - right.commentData.createdTime,
      )

    let failed = 0
    if (pending.length > 0) {
      // Counted before enqueueing: the first replay can run at once, and its
      // finish must find the counter. The count drives the list's
      // "processing" status and blocks another run until the last replay.
      await commentAutomationService.startMissedCommentsReplay(
        automation.id,
        pending.length,
      )
      const enqueued = await enqueueReplays({
        workspaceId: props.workspaceId,
        automationId: automation.id,
        channelType,
        comments: pending,
      })
      failed = enqueued.failed
      await commentAutomationService.settleMissedCommentsEnqueue(
        automation.id,
        enqueued,
      )
    }

    return {
      status: "done",
      scanned: comments.length,
      skipped: comments.length - pending.length,
      queued: pending.length - failed,
      failed,
    }
  } finally {
    await commentAutomationService.releaseMissedCommentsRun(automation.id)
  }
}

/**
 * Enqueues the replays on the `low` queue, one comment per job. Comments are
 * grouped by channel account, and each group books its time on that account's
 * replay timeline, then spaces its jobs `MISSED_COMMENTS_REPLAY_SPACING_MS`
 * apart inside the booking. Jobs go out in chunks; a failed chunk is counted
 * and skipped rather than stopping the run.
 *
 * The job id makes a second run a no-op for a comment whose replay is still
 * queued (waiting its turn) and so has no event row yet. One attempt only: a
 * retry could send a reply twice, while a comment whose replay failed simply
 * has no event row and is picked up by the next run.
 *
 * Returns how many comments failed to enqueue, and the delay of the last
 * scheduled replay.
 */
async function enqueueReplays(props: {
  workspaceId: string
  automationId: string
  channelType: CommentAutomationType
  comments: ScannedComment[]
}): Promise<{ failed: number; lastDelayMs: number }> {
  const { workspaceId, automationId, channelType, comments } = props

  let failed = 0
  let lastDelayMs = 0
  for (const [integrationIdentifier, group] of groupByIntegration(comments)) {
    const startAt =
      await commentAutomationService.reserveMissedCommentsReplayWindow({
        channelType,
        integrationIdentifier,
        spanMs: group.length * MISSED_COMMENTS_REPLAY_SPACING_MS,
      })
    const firstDelay = Math.max(0, startAt - Date.now())

    const jobs = group.map(
      (comment, index): ReplayJob => ({
        name: LowJobAction.replayMissedComment,
        data: {
          type: LowJobAction.replayMissedComment,
          data: {
            workspaceId,
            integrationType: channelType,
            integrationIdentifier,
            commentData: comment.commentData,
            replay: { automationId },
          },
        },
        opts: {
          jobId: `missed-comment-${automationId}-${comment.commentData.commentId}`,
          delay: firstDelay + index * MISSED_COMMENTS_REPLAY_SPACING_MS,
          attempts: 1,
        },
      }),
    )

    failed += await addInChunks({ automationId, jobs })
    lastDelayMs = Math.max(lastDelayMs, jobs.at(-1)?.opts.delay ?? 0)
  }

  return { failed, lastDelayMs }
}

function groupByIntegration(
  comments: ScannedComment[],
): Map<string, ScannedComment[]> {
  const groups = new Map<string, ScannedComment[]>()
  for (const comment of comments) {
    const group = groups.get(comment.integrationIdentifier)
    if (group) {
      group.push(comment)
    } else {
      groups.set(comment.integrationIdentifier, [comment])
    }
  }
  return groups
}

async function addInChunks(props: {
  automationId: string
  jobs: ReplayJob[]
}): Promise<number> {
  const { automationId, jobs } = props
  let failed = 0
  for (
    let start = 0;
    start < jobs.length;
    start += MISSED_COMMENTS_ENQUEUE_CHUNK_SIZE
  ) {
    const chunk = jobs.slice(start, start + MISSED_COMMENTS_ENQUEUE_CHUNK_SIZE)
    try {
      await lowQueue.addBulk(chunk)
    } catch (error) {
      failed += chunk.length
      logger.error(
        {
          err: error,
          automationId,
          chunkStart: start,
          chunkSize: chunk.length,
        },
        "Process missed comments: enqueueing a chunk of comments failed",
      )
    }
  }
  return failed
}
