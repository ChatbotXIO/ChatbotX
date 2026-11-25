import {
  CHANNEL_POST_SYNC_JOB_BUDGET_MS,
  CHANNEL_POST_SYNC_MAX_ATTEMPTS,
  CHANNEL_POST_SYNC_MAX_PAGES_PER_JOB,
  CHANNEL_POST_SYNC_MAX_POSTS_PER_CYCLE,
  CHANNEL_POST_SYNC_PAGE_SIZE,
  CHANNEL_POST_SYNC_RATE_LIMIT_BACKOFF_MS,
  type ChannelPostPageOutcome,
  type ClaimedChannelPostSync,
  channelPostSyncRetryDelayMs,
  channelPostSyncService,
} from "@chatbotx.io/business"
import { INTEGRATION_AUTH_MISSING_CODE } from "@chatbotx.io/channel-registry"
import { isForeignKeyViolationError } from "@chatbotx.io/database/client"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import type { LowJobSyncChannelPosts } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { resolvePostIntegration } from "./resolve-post-integration"

const MAX_ERROR_LENGTH = 500

/** What a failure means for the sync; `delayMs` is the wait before a retry. */
type FailureDecision = {
  category: string | null
  /** The failure counts against the sync's attempts. */
  countAttempt: boolean
  delayMs: number
  message: string
  /** No retry can fix it: stop the sync until a person acts. */
  permanent: boolean
}

/**
 * Decides what a failure means for the sync: a rate limit waits without
 * counting against the sync, an error no retry can fix (authorisation,
 * permission, a payload the platform rejects) stops it for a person to fix,
 * and anything else is retried with a growing wait until it runs out of
 * attempts.
 */
export const classifyFailure = (
  err: unknown,
  attempts: number,
): FailureDecision => {
  const message = (err instanceof Error ? err.message : String(err)).slice(
    0,
    MAX_ERROR_LENGTH,
  )
  const category = err instanceof ChannelError ? err.category : null
  const stop = {
    category,
    countAttempt: true,
    delayMs: 0,
    message,
    permanent: true,
  }

  if (err instanceof ChannelError) {
    if (err.category === ChannelErrorCategory.RATE_LIMITED) {
      return {
        ...stop,
        countAttempt: false,
        delayMs: CHANNEL_POST_SYNC_RATE_LIMIT_BACKOFF_MS,
        permanent: false,
      }
    }
    if (err.isPermanent) {
      return stop
    }
  }
  const failedAttempts = attempts + 1
  if (failedAttempts >= CHANNEL_POST_SYNC_MAX_ATTEMPTS) {
    return stop
  }
  return {
    ...stop,
    delayMs: channelPostSyncRetryDelayMs(failedAttempts),
    permanent: false,
  }
}

/** The channel has no integration for the inbox: it is not connected, not a failed sync. */
const isNotConnected = (err: unknown): boolean =>
  err instanceof ChannelError && err.code === INTEGRATION_AUTH_MISSING_CODE

/**
 * A saved resume cursor the channel no longer accepts (it can go stale between
 * retries, or after a change of its format) would fail every retry the same
 * way. Only a rejected cursor (`PAYLOAD_INVALID`) is retried from the start of
 * the listing; any other error, including an infrastructure one, keeps the
 * cursor so a long first listing does not begin again after one blip.
 */
const cursorMayBeStale = (
  err: unknown,
  input: { resumeCursor: string | null; isFirstRead: boolean },
): boolean =>
  input.isFirstRead &&
  input.resumeCursor !== null &&
  err instanceof ChannelError &&
  err.category === ChannelErrorCategory.PAYLOAD_INVALID

/**
 * One slice of an inbox's post sync, run by the `low` worker. Claims the
 * queued sync, then reads pages of the channel's own post listing and writes
 * them, for at most a few pages or one minute; whatever is left is handed to
 * the next scanner tick through the saved cursor. Every write after the claim
 * is fenced by the claim token, so a worker that was taken over stops the
 * moment it notices.
 */
export async function syncChannelPosts(
  data: LowJobSyncChannelPosts["data"],
): Promise<void> {
  const claim = await channelPostSyncService.claim(data.inboxId)
  if (!claim) {
    // Not queued any more: another worker took it, or it already finished.
    return
  }

  const startedAt = Date.now()
  const initialProgress = {
    resumeCursor: claim.resumeCursor,
    syncedCount: claim.resumeCursor ? claim.syncedCount : 0,
  }
  let progress = initialProgress
  try {
    await readPages(claim, startedAt, progress, (next) => {
      progress = next
    })
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The workspace or inbox was deleted while the sync ran.
      logger.info(
        { inboxId: claim.inboxId },
        "channel-post-sync: inbox deleted mid-sync",
      )
      return
    }
    await settleFailure(claim, err, progress, progress === initialProgress)
  }
}

/** What a written page does to the sync: finish it, hand it to the next tick, or go on reading. */
function pageOutcome(input: {
  finished: boolean
  hitCap: boolean
  outOfBudget: boolean
}): ChannelPostPageOutcome {
  if (input.finished) {
    return input.hitCap ? "capped" : "complete"
  }
  return input.outOfBudget ? "continueLater" : "progress"
}

async function readPages(
  claim: ClaimedChannelPostSync,
  startedAt: number,
  initial: { resumeCursor: string | null; syncedCount: number },
  remember: (progress: {
    resumeCursor: string | null
    syncedCount: number
  }) => void,
): Promise<void> {
  const { channel, ctx, integration, integrationId, sourceAccountId } =
    await resolvePostIntegration({
      channel: claim.channel,
      inboxId: claim.inboxId,
      workspaceId: claim.workspaceId,
    })
  const deadline = startedAt + CHANNEL_POST_SYNC_JOB_BUDGET_MS
  const timezone = await channelPostSyncService.workspaceTimezone(
    claim.workspaceId,
  )

  let cursor = initial.resumeCursor ?? undefined
  let syncedCount = initial.syncedCount
  let pages = 0
  for (;;) {
    const observedAt = new Date()
    const page = await integration.runChannelHandler("post", "listPosts", {
      ctx,
      data: { cursor, limit: CHANNEL_POST_SYNC_PAGE_SIZE },
    })
    const room = CHANNEL_POST_SYNC_MAX_POSTS_PER_CYCLE - syncedCount
    const items = page.items.slice(0, room)
    syncedCount += items.length
    pages += 1

    const hitCap =
      page.nextCursor !== null &&
      syncedCount >= CHANNEL_POST_SYNC_MAX_POSTS_PER_CYCLE
    const finished = page.nextCursor === null || hitCap
    const outcome = pageOutcome({
      finished,
      hitCap,
      outOfBudget:
        pages >= CHANNEL_POST_SYNC_MAX_PAGES_PER_JOB || Date.now() >= deadline,
    })
    // The page and the claim-fenced position are one transaction: a worker that
    // was taken over writes nothing, so it cannot overwrite newer metrics.
    const kept = await channelPostSyncService.commitPage({
      claim,
      outcome,
      page: {
        channel,
        inboxId: claim.inboxId,
        integrationId,
        items,
        observedAt,
        sourceAccountId,
        thumbnailDeadline: deadline,
        timezone,
        workspaceId: claim.workspaceId,
      },
      resumeCursor: page.nextCursor,
      syncedCount,
    })
    if (!kept) {
      logOwnershipLost(claim, outcome)
      return
    }
    if (outcome !== "progress") {
      return
    }
    remember({ resumeCursor: page.nextCursor, syncedCount })
    cursor = page.nextCursor ?? undefined
  }
}

/** Where a sync that must start over from the first page resumes. */
const RESET_PROGRESS = { resumeCursor: null, syncedCount: 0 }

async function settleFailure(
  claim: ClaimedChannelPostSync,
  err: unknown,
  progress: { resumeCursor: string | null; syncedCount: number },
  isFirstRead: boolean,
): Promise<void> {
  if (isNotConnected(err)) {
    logger.info(
      { inboxId: claim.inboxId },
      "channel-post-sync: inbox has no integration, sync parked",
    )
    if (!(await channelPostSyncService.markNotConnected(claim))) {
      logOwnershipLost(claim, "markNotConnected")
    }
    return
  }
  const restart = cursorMayBeStale(err, {
    isFirstRead,
    resumeCursor: progress.resumeCursor,
  })
  const failure = classifyFailure(err, claim.attempts)
  // A rejected cursor is not a failure of the sync itself: start over from the
  // first page, counting the attempt, unless the attempts ran out.
  const decision =
    restart &&
    failure.permanent &&
    claim.attempts + 1 < CHANNEL_POST_SYNC_MAX_ATTEMPTS
      ? {
          ...failure,
          delayMs: channelPostSyncRetryDelayMs(claim.attempts + 1),
          permanent: false,
        }
      : failure
  logger.warn(
    { err, inboxId: claim.inboxId, permanent: decision.permanent, restart },
    "channel-post-sync: sync failed",
  )
  let kept: boolean
  if (decision.permanent) {
    kept = await channelPostSyncService.fail(claim, decision)
  } else {
    kept = await channelPostSyncService.retryLater(claim, {
      ...decision,
      ...(restart ? RESET_PROGRESS : progress),
    })
  }
  if (!kept) {
    logOwnershipLost(claim, "settleFailure")
  }
}

function logOwnershipLost(claim: ClaimedChannelPostSync, step: string): void {
  logger.warn(
    { inboxId: claim.inboxId, step },
    "channel-post-sync: the sync was taken over, stopping",
  )
}
