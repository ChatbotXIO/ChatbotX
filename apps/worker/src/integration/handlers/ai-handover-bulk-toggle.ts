import {
  AI_HANDOVER_BULK_CHUNK_BUDGET_MS,
  AI_HANDOVER_BULK_MAX_PAUSE_MS,
  AI_HANDOVER_BULK_RUN_ERRORS,
  aiHandoverBulkRunService,
  aiHandoverSettingsService,
  type BulkRunInbox,
  ThreadControlUnsupportedError,
} from "@chatbotx.io/business"
import {
  type BulkThreadControl,
  createBulkThreadControl,
} from "@chatbotx.io/channel-registry/thread-control"
import { toThreadControlTimestamp } from "@chatbotx.io/database/partials"
import type {
  AiHandoverBulkRunGuard,
  BulkAiContactInboxRow,
} from "@chatbotx.io/database/repositories"
import type { AiHandoverBulkRunModel } from "@chatbotx.io/database/types"
import {
  type BulkThreadControlLimits,
  type BulkThreadControlResult,
  ChannelError,
  ChannelErrorCategory,
} from "@chatbotx.io/sdk"
import type { IntegrationJobAiHandoverBulkToggle } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  accountBatch,
  isPageRefused,
  isTokenFailure,
} from "./ai-handover-bulk-batch-accounting"
import { settleBatchResults } from "./ai-handover-bulk-settle"

type BulkToggleJobData = IntegrationJobAiHandoverBulkToggle["data"]

/** How one step of the walk ended; anything but `continue` ends the chunk. */
type StepOutcome =
  | "continue"
  /** Cancelled, failed, or released: the run row has already been settled. */
  | "ended"
  /** The claim was taken over: stop touching the run. */
  | "abandoned"

type Tally = { processed: number; skipped: number; failed: number }

type ChunkContext = {
  run: AiHandoverBulkRunModel
  expect: AiHandoverBulkRunGuard
  startedAt: number
  /** Outcomes of THIS run so far (stored counters + this chunk), for the final total. */
  tally: Tally
  /**
   * Where the walk is in the Page, kept in step with every cursor write. The
   * claimed row is a snapshot; reading the cursor from it after a write would
   * resume from a stale position and send a batch twice.
   */
  cursor: { contactInboxId: string | null }
  /** Whole-call channel failures in a row (a disable counts the batch failed). */
  consecutiveCallFailures: number
  /**
   * A batch of this run already reached the channel (this chunk or an earlier
   * one), so the Page has been probed.
   */
  hasReachedChannel: boolean
}

/** The delayed continuation fires this long after the pause ends. */
const PAUSE_RESUME_SLACK_MS = 1000

/** A disable stops after this many unreachable batches in a row. */
const MAX_CONSECUTIVE_CALL_FAILURES = 3

const noTally = (): Tally => ({ processed: 0, skipped: 0, failed: 0 })

const isOverBudget = ({ startedAt }: ChunkContext): boolean =>
  Date.now() - startedAt >= AI_HANDOVER_BULK_CHUNK_BUDGET_MS

const finishRun = async (
  ctx: ChunkContext,
  status: "completed" | "failed" | "cancelled",
  currentError?: string,
): Promise<StepOutcome> => {
  const { processed, skipped, failed } = ctx.tally
  const written = await aiHandoverBulkRunService.finish({
    runId: ctx.run.id,
    expect: ctx.expect,
    outcome: {
      status,
      currentError,
      // What was actually walked, not the estimate counted at the start.
      totalCount: processed + skipped + failed,
    },
  })
  if (written === 0) {
    logger.warn(
      { runId: ctx.run.id },
      "[ai-handover-bulk] finish lost the claim",
    )
    return "ended"
  }
  await reconcileAfterEnd(ctx)
  return "ended"
}

/**
 * A run ended: the Page's desired state may have moved on while it ran (a
 * newer revision was waiting for it to stop), so create whatever is due now.
 * Best effort: the sweeper reconciles too, so a failure only delays it.
 */
const reconcileAfterEnd = async (ctx: ChunkContext): Promise<void> => {
  const { workspaceId, inboxId } = ctx.run
  try {
    await aiHandoverBulkRunService.reconcile({ workspaceId, inboxId })
  } catch (err) {
    logger.error(
      { err, runId: ctx.run.id },
      "[ai-handover-bulk] reconcile after the run ended failed",
    )
  }
}

/**
 * One guarded progress write. A run an admin cancelled in the meantime is wound
 * down here; a lost claim abandons.
 */
const writeProgress = async (
  ctx: ChunkContext,
  progress: Parameters<
    typeof aiHandoverBulkRunService.recordProgress
  >[0]["progress"],
): Promise<StepOutcome> => {
  const status = await aiHandoverBulkRunService.recordProgress({
    runId: ctx.run.id,
    expect: ctx.expect,
    progress,
  })
  if (status === null) {
    logger.warn(
      { runId: ctx.run.id },
      "[ai-handover-bulk] claim lost, abandoning",
    )
    return "abandoned"
  }
  // The write landed: mirror it locally.
  ctx.tally.processed += progress.addProcessed ?? 0
  ctx.tally.skipped += progress.addSkipped ?? 0
  ctx.tally.failed += progress.addFailed ?? 0
  if (progress.cursorContactInboxId !== undefined) {
    ctx.cursor.contactInboxId = progress.cursorContactInboxId
  }
  return status === "cancelling"
    ? await finishRun(ctx, "cancelled")
    : "continue"
}

const toOutgoingContact = (row: BulkAiContactInboxRow) => ({
  id: row.id,
  sourceId: row.sourceId,
  lastIncomingMessageAt: row.lastIncomingMessageAt,
})

type BatchProps = {
  ctx: ChunkContext
  inbox: BulkRunInbox
  bulk: BulkThreadControl
  rows: BulkAiContactInboxRow[]
  /** Where this page of rows started (the cursor before it). */
  afterId: string | null
  isFirstBatch: boolean
}

/** The channel asked to wait out its quota before the next call. */
type Pause = { pauseMs: number }

/** What a batch decided about its Page. */
type BatchOutcome = StepOutcome | "pageRefused" | Pause

const isPause = (value: unknown): value is Pause =>
  typeof value === "object" && value !== null && "pauseMs" in value

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The write that closes a batch: its counters, the cursor, and no marker left. */
const settledProgress = (
  tally: Tally,
  lastId: string | null,
): Parameters<typeof writeProgress>[1] => ({
  addProcessed: tally.processed,
  addSkipped: tally.skipped,
  addFailed: tally.failed,
  cursorContactInboxId: lastId,
  inFlightFromId: null,
  inFlightToId: null,
})

type FailedBatch = { batchSize: number; skipped: number; lastId: string | null }

/**
 * Ends the run with a failure after the batch that caused it: that batch is
 * counted failed (and its cursor moved past, so a disable never repeats it)
 * first, or the history would under-report what was attempted.
 */
const finishWithFailedBatch = async (
  ctx: ChunkContext,
  failed: FailedBatch,
  reason: string,
): Promise<StepOutcome> => {
  const written = await writeProgress(
    ctx,
    settledProgress(
      { processed: 0, skipped: failed.skipped, failed: failed.batchSize },
      failed.lastId,
    ),
  )
  return written === "continue"
    ? await finishRun(ctx, "failed", reason)
    : written
}

/**
 * The channel call itself failed (not one thread). A revoked token ends the
 * run. For an enable (a pass is idempotent) the lease is released and the
 * sweeper repeats the same batch. A disable cannot know whether any message
 * left, so it never repeats the batch: it counts it failed, moves on, and gives
 * up when the channel stays unreachable.
 */
const endForCallFailure = async (
  ctx: ChunkContext,
  limits: BulkThreadControlLimits,
  err: unknown,
  failed: FailedBatch,
): Promise<StepOutcome | Pause> => {
  if (
    err instanceof ChannelError &&
    err.category === ChannelErrorCategory.AUTH_FAILED
  ) {
    return await finishWithFailedBatch(
      ctx,
      failed,
      AI_HANDOVER_BULK_RUN_ERRORS.tokenInvalid,
    )
  }
  if (
    err instanceof ChannelError &&
    err.category === ChannelErrorCategory.RATE_LIMITED
  ) {
    // The channel refused the whole call before doing anything: nothing left, so the
    // batch is not in flight. Clear the markers (a disable would otherwise skip
    // it on resume) and wait the limit out.
    const cleared = await writeProgress(ctx, {
      inFlightFromId: null,
      inFlightToId: null,
    })
    return cleared === "continue"
      ? { pauseMs: limits.rateLimitPauseMs }
      : cleared
  }
  logger.warn(
    { err, runId: ctx.run.id },
    "[ai-handover-bulk] channel call failed",
  )

  if (ctx.run.action === "enable") {
    const chunkSeq = await aiHandoverBulkRunService.yieldForContinuation({
      runId: ctx.run.id,
      expect: ctx.expect,
    })
    if (chunkSeq === null) {
      logger.warn(
        { runId: ctx.run.id },
        "[ai-handover-bulk] release lost the claim",
      )
    }
    return "ended"
  }

  ctx.consecutiveCallFailures += 1
  if (ctx.consecutiveCallFailures >= MAX_CONSECUTIVE_CALL_FAILURES) {
    return await finishWithFailedBatch(
      ctx,
      failed,
      AI_HANDOVER_BULK_RUN_ERRORS.channelUnavailable,
    )
  }
  const written = await writeProgress(ctx, {
    ...settledProgress(
      { processed: 0, skipped: failed.skipped, failed: failed.batchSize },
      failed.lastId,
    ),
    currentError: AI_HANDOVER_BULK_RUN_ERRORS.batchFailed,
  })
  return written
}

/**
 * One channel batch: re-check eligibility, mark the batch in flight, call the
 * channel, record every success, then persist the cursor and counters. A write
 * that finds the claim lost or the run cancelled ends the chunk; a channel that
 * asks to slow down pauses the run.
 */
const processBatch = async (props: BatchProps): Promise<BatchOutcome> => {
  const { ctx, inbox, bulk, rows, afterId, isFirstBatch } = props
  const { run } = ctx
  const lastId = rows.at(-1)?.id ?? null

  const eligibleIds = new Set(
    await aiHandoverBulkRunService.listStillEligible({
      run,
      ids: rows.map((row) => row.id),
      now: new Date(),
    }),
  )
  const batch = rows.filter((row) => eligibleIds.has(row.id))
  if (batch.length === 0) {
    return await writeProgress(
      ctx,
      settledProgress({ ...noTally(), skipped: rows.length }, lastId),
    )
  }

  // Stamped BEFORE the call: an event that lands while it is in flight is
  // newer than our action and must win the guarded write.
  const dispatchedAt = toThreadControlTimestamp(new Date())
  const marked = await writeProgress(ctx, {
    inFlightFromId: batch[0].id,
    inFlightToId: batch.at(-1)?.id ?? null,
  })
  if (marked !== "continue") {
    return marked
  }

  ctx.hasReachedChannel = true
  let response: BulkThreadControlResult
  try {
    response = await bulk.run({
      action: run.action === "enable" ? "handToAi" : "takeFromAi",
      contacts: batch.map(toOutgoingContact),
      text: run.message ?? undefined,
    })
  } catch (err) {
    return await endForCallFailure(ctx, bulk.limits, err, {
      batchSize: batch.length,
      skipped: rows.length - batch.length,
      lastId,
    })
  }
  ctx.consecutiveCallFailures = 0

  const { processed, results } = await settleBatchResults({
    run,
    inbox,
    batch,
    response,
    dispatchedAt,
  })
  const account = accountBatch({ rows, eligibleIds, results, afterId })
  const isRefused =
    isFirstBatch &&
    response.retryAfterMs === null &&
    isPageRefused(response.results)
  // A refused Page ends the run with its own reason (`endPageUnusable`).
  const currentError = account.isUnderSent
    ? AI_HANDOVER_BULK_RUN_ERRORS.batchFailed
    : undefined
  const outcome = await writeProgress(ctx, {
    ...settledProgress(
      { processed, skipped: account.skipped, failed: account.failed },
      account.cursorContactInboxId,
    ),
    ...(currentError && { currentError }),
  })
  if (outcome !== "continue") {
    return outcome
  }
  if (response.results.some(isTokenFailure)) {
    // The Page token died mid-batch: what did succeed is recorded above.
    return await finishRun(
      ctx,
      "failed",
      AI_HANDOVER_BULK_RUN_ERRORS.tokenInvalid,
    )
  }
  if (response.retryAfterMs !== null) {
    return { pauseMs: response.retryAfterMs }
  }
  return isRefused ? "pageRefused" : "continue"
}

/**
 * Ends the run for a Page that cannot be worked (its integration cannot be
 * loaded, or it refuses the hand-over for lack of permission): its remaining
 * eligible threads are counted skipped, so the history adds up, and the run
 * fails with the reason.
 */
const endPageUnusable = async (
  ctx: ChunkContext,
  reason: string,
): Promise<StepOutcome> => {
  // Only what is still ahead of the cursor: what the run already walked is
  // counted, and counting it again would make the total exceed the threads.
  const remaining = await aiHandoverBulkRunService.countEligible({
    run: ctx.run,
    afterId: ctx.cursor.contactInboxId,
    now: new Date(),
  })
  logger.warn(
    { runId: ctx.run.id, inboxId: ctx.run.inboxId, remaining, reason },
    "[ai-handover-bulk] page unusable",
  )
  const written = await writeProgress(ctx, {
    addSkipped: remaining,
  })
  return written === "continue"
    ? await finishRun(ctx, "failed", reason)
    : written
}

/**
 * The first batch of a Page probes it with a single thread: a Page not
 * onboarded to the AI agent, or one the app may not hand over, then refuses one
 * contact instead of a whole batch.
 */
const PROBE_SIZE = 1

/** Why a run must stop although nothing went wrong in it, `null` to carry on. */
const stopReasonOf = (ctx: ChunkContext): Promise<string | null> =>
  aiHandoverSettingsService.findStopReason({
    workspaceId: ctx.run.workspaceId,
    inboxId: ctx.run.inboxId,
    // Only a hand-over needs the automation to keep running behind it: its
    // take-back would undo every further pass. Taking threads back does not.
    requiresAutomation: ctx.run.action === "enable",
  })

/** Walks the Page's eligible threads. Returns `pageDone` when none are left. */
const processPage = async (
  ctx: ChunkContext,
  inbox: BulkRunInbox,
): Promise<StepOutcome | "pageDone" | "yield" | Pause> => {
  let bulk: BulkThreadControl
  try {
    bulk = await createBulkThreadControl({
      workspaceId: ctx.run.workspaceId,
      inbox: { channel: inbox.channel, inboxId: inbox.id },
    })
  } catch (err) {
    if (err instanceof ThreadControlUnsupportedError) {
      return await finishRun(
        ctx,
        "failed",
        AI_HANDOVER_BULK_RUN_ERRORS.channelUnsupported,
      )
    }
    logger.warn(
      { err, runId: ctx.run.id, inboxId: inbox.id },
      "[ai-handover-bulk] integration unavailable",
    )
    return await endPageUnusable(
      ctx,
      AI_HANDOVER_BULK_RUN_ERRORS.integrationUnavailable,
    )
  }

  let afterId = ctx.cursor.contactInboxId
  for (;;) {
    if (isOverBudget(ctx)) {
      return "yield"
    }
    // Before every batch: the Page may have been disconnected, or the
    // automation switched off, since the last one (a cached read).
    const stopReason = await stopReasonOf(ctx)
    if (stopReason) {
      return await finishRun(ctx, "cancelled", stopReason)
    }
    // The probe stays a single thread until a batch has really reached the
    // channel: a probe row that was no longer eligible sent nothing, so the next
    // batch is still the Page's first contact with Meta.
    const isFirstBatch = !ctx.hasReachedChannel
    const limit = isFirstBatch ? PROBE_SIZE : bulk.limits.maxBatchSize
    const rows = await aiHandoverBulkRunService.listEligiblePage({
      run: ctx.run,
      afterId,
      limit,
      now: new Date(),
    })
    if (rows.length === 0) {
      return "pageDone"
    }

    const outcome = await processBatch({
      ctx,
      inbox,
      bulk,
      rows,
      afterId,
      isFirstBatch,
    })
    if (isPause(outcome)) {
      return outcome
    }
    if (outcome === "pageRefused") {
      return await endPageUnusable(ctx, AI_HANDOVER_BULK_RUN_ERRORS.pageRefused)
    }
    if (outcome !== "continue") {
      return outcome
    }
    // The stored cursor, not the last row: a batch that stopped early (rows the
    // channel deferred) must be walked again from where it stopped.
    afterId = ctx.cursor.contactInboxId
    if (rows.length < limit) {
      return "pageDone"
    }
    // Spread the calls over time (Meta's guidance), never one burst.
    await sleep(bulk.limits.batchGapMs)
  }
}

/**
 * A disable that crashed with a batch in flight cannot know which of its
 * messages left: it skips past that batch (under-send, never double-send). An
 * enable (a pass is idempotent) simply repeats it.
 */
const recoverInFlightBatch = async (
  ctx: ChunkContext,
): Promise<StepOutcome> => {
  const { run } = ctx
  if (run.inFlightToId === null) {
    return "continue"
  }
  return await writeProgress(ctx, {
    // The skipped messages cannot be counted: flag the run so the history shows
    // that some contacts were not confirmed.
    ...(run.action === "disable" && {
      cursorContactInboxId: run.inFlightToId,
      currentError: AI_HANDOVER_BULK_RUN_ERRORS.batchFailed,
    }),
    inFlightFromId: null,
    inFlightToId: null,
  })
}

/** Counts the threads the run will touch, once, for the progress bar. */
const countTotal = async (ctx: ChunkContext): Promise<StepOutcome> => {
  if (ctx.run.totalCount !== null) {
    return "continue"
  }
  const total = await aiHandoverBulkRunService.countEligible({
    run: ctx.run,
    now: new Date(),
  })
  return await writeProgress(ctx, { totalCount: total })
}

const yieldAndContinue = async (ctx: ChunkContext): Promise<void> => {
  const { run } = ctx
  const chunkSeq = await aiHandoverBulkRunService.yieldForContinuation({
    runId: run.id,
    expect: ctx.expect,
  })
  if (chunkSeq === null) {
    logger.warn({ runId: run.id }, "[ai-handover-bulk] yield lost the claim")
    return
  }
  try {
    await aiHandoverBulkRunService.enqueueChunk({ ...run, chunkSeq })
  } catch (err) {
    logger.error(
      { err, runId: run.id },
      "[ai-handover-bulk] continuation enqueue failed, reopening for the sweeper",
    )
    await aiHandoverBulkRunService.reopenReleased(run.id)
  }
}

/**
 * Parks the run until the channel's quota recovers: releases the lease with
 * `pausedUntil` set (nothing claims or re-dispatches it before then) and queues
 * the next chunk delayed by the same amount.
 */
const pauseAndContinue = async (
  ctx: ChunkContext,
  pauseMs: number,
): Promise<void> => {
  const { run } = ctx
  const delayMs = Math.min(pauseMs, AI_HANDOVER_BULK_MAX_PAUSE_MS)
  logger.info(
    { runId: run.id, delayMs },
    "[ai-handover-bulk] channel quota low, pausing the run",
  )
  const chunkSeq = await aiHandoverBulkRunService.yieldForContinuation({
    runId: run.id,
    expect: ctx.expect,
    pausedUntil: new Date(Date.now() + delayMs),
  })
  if (chunkSeq === null) {
    logger.warn({ runId: run.id }, "[ai-handover-bulk] pause lost the claim")
    return
  }
  try {
    // A touch after `pausedUntil`: the claim compares it with the database
    // clock, and a few milliseconds of skew would otherwise make the delayed job
    // find the pause not yet over.
    await aiHandoverBulkRunService.enqueueChunk(
      { ...run, chunkSeq },
      { delayMs: delayMs + PAUSE_RESUME_SLACK_MS },
    )
  } catch (err) {
    logger.error(
      { err, runId: run.id },
      "[ai-handover-bulk] delayed continuation enqueue failed, reopening for the sweeper",
    )
    await aiHandoverBulkRunService.reopenReleased(run.id)
  }
}

/** The ordered steps before the walk; stops at the first that ends the chunk. */
const prepare = async (
  ctx: ChunkContext,
): Promise<StepOutcome | { inbox: BulkRunInbox }> => {
  const { run } = ctx
  if (run.status === "cancelling") {
    return await finishRun(ctx, "cancelled")
  }
  const stopReason = await stopReasonOf(ctx)
  if (stopReason) {
    return await finishRun(ctx, "cancelled", stopReason)
  }
  const recovered = await recoverInFlightBatch(ctx)
  if (recovered !== "continue") {
    return recovered
  }
  const inbox = await aiHandoverBulkRunService.findRunInbox(run)
  if (!inbox) {
    // The Page is gone: nothing left to walk.
    return await finishRun(
      ctx,
      "cancelled",
      AI_HANDOVER_BULK_RUN_ERRORS.pageDisconnected,
    )
  }
  const counted = await countTotal(ctx)
  return counted === "continue" ? { inbox } : counted
}

const drive = async (ctx: ChunkContext): Promise<void> => {
  const prepared = await prepare(ctx)
  if (typeof prepared === "string") {
    return
  }
  const outcome = await processPage(ctx, prepared.inbox)
  if (isPause(outcome)) {
    await pauseAndContinue(ctx, outcome.pauseMs)
  } else if (outcome === "yield") {
    await yieldAndContinue(ctx)
  } else if (outcome === "pageDone") {
    await finishRun(ctx, "completed")
  }
}

/**
 * Runs one budgeted chunk of a bulk "apply to all customers" run. The run row
 * is the only input: the claim proves ownership, every write is guarded by it,
 * and a chunk that runs out of budget releases the lease and queues the next.
 * Job payloads carry no instructions, so a stale or forged job can only ask the
 * engine to continue a run that is genuinely live.
 */
export async function runAiHandoverBulkToggle(
  data: BulkToggleJobData,
): Promise<void> {
  const run = await aiHandoverBulkRunService.claim({
    runId: data.runId,
    workspaceId: data.workspaceId,
  })
  if (!run?.claimToken) {
    return
  }
  const ctx: ChunkContext = {
    run,
    expect: { claimToken: run.claimToken },
    startedAt: Date.now(),
    tally: {
      processed: run.processedCount,
      skipped: run.skippedCount,
      failed: run.failedCount,
    },
    cursor: { contactInboxId: run.cursorContactInboxId },
    consecutiveCallFailures: 0,
    hasReachedChannel: run.processedCount + run.failedCount > 0,
  }
  try {
    await drive(ctx)
  } catch (err) {
    logger.error({ err, runId: run.id }, "[ai-handover-bulk] chunk crashed")
    // Leave the lease to expire: the sweeper re-dispatches after the stale
    // window and the in-flight markers keep a disable from re-sending.
    throw err
  }
}
