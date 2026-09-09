import { coexistService } from "@chatbotx.io/business/coexist"
import {
  COEXIST_HISTORY_DECLINED_ERROR,
  isWhatsappHistoryTerminal,
} from "@chatbotx.io/business/coexist/history"
import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  integrationWhatsappRepository,
  whatsappCoexistStagingRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCoexistStagingModel } from "@chatbotx.io/database/types"
import {
  buildCoexistPageJobId,
  IntegrationJobAction,
  type IntegrationJobCoexistWhatsappFlush,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { bulkImportHistorical } from "./bulk-historical-import"
import {
  abandon,
  type FlushContext,
  type FlushState,
  loadFlushContext,
  seedState,
  stillOwnsRun,
} from "./whatsapp-flush-context"
import {
  applyPostBatchPatches,
  capPendingPatches,
  pendingPatchesToBatch,
  pendingPatchKey,
} from "./whatsapp-flush-patches"
import { type ReducedBatch, reduceStagedRows } from "./whatsapp-flush-reduce"
import { reduceMetadata } from "./whatsapp-history-payload"

// Re-exported so the payload-shape tests keep importing it from the handler
// module they exercise.
export { extractFromValue } from "./whatsapp-history-payload"

/** Staging rows processed per chunk. Tuned for ~30s wall-time per chunk. */
const BATCH_SIZE = 100

/**
 * Active wall-time budget per chunk. When exceeded, the job persists state and
 * either hot-chains a continuation enqueue or yields to the scheduler.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/**
 * Statuses this handler may write. `waiting` is the non-terminal one: the run
 * drained everything staged so far and Meta still owes it history.
 */
type FlushFinalStatus = "succeeded" | "failed" | "partial" | "waiting"

/** Why the drain loop stopped. */
type DrainOutcome =
  /** Nothing left staged — the run may now be finalized or parked. */
  | "exhausted"
  /** Time budget spent, or late rows staged after the drain. */
  | "continueLater"
  /** A guarded write reported 0 rows: this worker no longer owns the run. */
  | "lostClaim"

/** The outcome decision, applied ONLY once Meta's terminal signal is in. */
const resolveTerminalStatus = (counters: {
  failed: number
  importedMessages: number
  skipped: number
}): FlushFinalStatus => {
  if (
    counters.failed > 0 &&
    (counters.importedMessages > 0 || counters.skipped > 0)
  ) {
    return "partial"
  }
  if (counters.failed > 0) {
    return "failed"
  }
  return "succeeded"
}

/**
 * Enqueues one download job per Attachment inserted by this batch (inline or
 * post-batch). Never throws: the bytes stay pending and the row is recoverable.
 */
const enqueueAttachmentDownloads = async (
  context: FlushContext,
  attachmentIds: string[],
): Promise<void> => {
  if (attachmentIds.length === 0) {
    return
  }
  try {
    await integrationQueue.addBulk(
      attachmentIds.map((attachmentId) => ({
        name: IntegrationJobAction.coexistAttachmentDownload,
        data: {
          type: IntegrationJobAction.coexistAttachmentDownload,
          data: {
            attachmentId,
            workspaceId: context.integration.workspaceId,
            channel: "whatsapp" as const,
            integrationId: context.integration.id,
          },
        },
        opts: {
          jobId: `att-${attachmentId}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: { count: 100 },
        },
      })),
    )
  } catch (error) {
    logger.error(
      { error, runId: context.runId, count: attachmentIds.length },
      "[coexist] WhatsApp attachment download enqueue failed — bytes left as pending",
    )
  }
}

/** Replays carried patches plus this batch's, and re-caps what stays pending. */
const applyBatchPatches = async (
  context: FlushContext,
  state: FlushState,
  reduced: ReducedBatch,
): Promise<string[]> => {
  const carried = pendingPatchesToBatch(state.pendingPatches)
  const result = await applyPostBatchPatches({
    workspaceId: context.integration.workspaceId,
    inboxId: context.integration.inboxId,
    mediaFollowUps: [...carried.mediaFollowUps, ...reduced.mediaFollowUps],
    edits: [...carried.edits, ...reduced.edits],
    revokes: [...carried.revokes, ...reduced.revokes],
    stagedAtByKey: new Map(
      state.pendingPatches.map((patch) => [
        pendingPatchKey(patch),
        patch.stagedAt,
      ]),
    ),
  })
  state.pendingPatches = capPendingPatches(result.unresolved)
  return result.insertedAttachmentIds
}

/** The run-level bookkeeping written at the end of every batch. */
const persistBatchProgress = (
  context: FlushContext,
  state: FlushState,
): Promise<number> =>
  coexistService.updateProgress({
    runId: context.runId,
    expect: context.guard,
    fields: {
      currentScan: state.totalRows,
      importedContactCount: state.importedContacts,
      importedMessageCount: state.importedMessages,
      skippedCount: state.skipped,
      failedCount: state.failed,
      currentPageNumber: state.batchNumber,
      currentStep: `flushing batch ${state.batchNumber}`,
      currentError: state.currentError ?? null,
      lastHeartbeatAt: new Date(),
      pendingPatches: { entries: state.pendingPatches },
      // Written from the RUN-level reduction, not the batch's: the furthest
      // point Meta reached, reduced lexicographically by
      // (phase, progress, chunkOrder). `syncProgress` is Meta's PER-PHASE
      // percentage, so it may legitimately drop when a new phase starts
      // (phase 1 @100 → phase 2 @10); within a phase it never regresses.
      ...(state.runMetadata
        ? {
            lastPhase: state.runMetadata.phase,
            lastChunkOrder: state.runMetadata.chunkOrder,
            syncProgress: state.runMetadata.progress,
          }
        : {}),
    },
  })

/** How one batch ended. */
type BatchOutcome = "next" | "exhausted" | "declined" | "lostClaim"

/**
 * Selects, imports and books one batch of staged rows.
 *
 * Ownership is re-validated at THREE points — before the select, immediately
 * before the import, and before staging rows are marked processed — so a worker
 * that lost the run to a reclaim stops at the next boundary instead of writing
 * on top of the new owner.
 */
const drainBatch = async (
  context: FlushContext,
  state: FlushState,
): Promise<BatchOutcome> => {
  state.batchNumber += 1
  if (!(await stillOwnsRun(context))) {
    return "lostClaim"
  }

  const stagedRows = await whatsappCoexistStagingRepository.listPending({
    phoneNumberId: context.phoneNumberId,
    limit: BATCH_SIZE,
  })
  if (stagedRows.length === 0) {
    return "exhausted"
  }

  const reduced = reduceStagedRows(stagedRows, context)
  state.terminalSeen ||= reduced.terminalSeen
  if (reduced.metadata) {
    state.runMetadata = reduceMetadata(state.runMetadata, reduced.metadata)
  }

  // Last ownership check before the expensive, side-effecting step. Bounds any
  // overlap with a reclaiming worker to at most ONE in-flight import.
  if (!(await stillOwnsRun(context))) {
    return "lostClaim"
  }

  await importAndPatch(context, state, reduced, stagedRows)

  // Re-validate before the staging writes: they are the ones that would hide
  // work from the run's new owner.
  if (!(await stillOwnsRun(context))) {
    return "lostClaim"
  }
  await markBatchStagingRows(stagedRows, reduced)

  if ((await persistBatchProgress(context, state)) === 0) {
    // The rows this batch committed above stay `processedAt` — they WERE
    // imported; only the run-level bookkeeping is lost with the claim.
    return "lostClaim"
  }

  if (reduced.declined) {
    return "declined"
  }
  return stagedRows.length < BATCH_SIZE ? "exhausted" : "next"
}

/**
 * The side-effecting half of a batch: bulk import, post-batch patches, and one
 * download job per Attachment inserted by EITHER phase (inline and post-batch).
 */
const importAndPatch = async (
  context: FlushContext,
  state: FlushState,
  reduced: ReducedBatch,
  stagedRows: WhatsappCoexistStagingModel[],
): Promise<void> => {
  const batchResult = await importBatch(context, state, reduced, stagedRows)
  const patchAttachmentIds = await applyBatchPatches(context, state, reduced)
  await enqueueAttachmentDownloads(context, [
    ...batchResult.insertedAttachmentIds,
    ...patchAttachmentIds,
  ])
}

/**
 * Runs the bulk import and folds its counters into the state. A throw is
 * re-thrown after counting the batch as failed: staging rows are NOT marked
 * processed, so the scheduler retries the batch.
 */
const importBatch = async (
  context: FlushContext,
  state: FlushState,
  reduced: ReducedBatch,
  stagedRows: WhatsappCoexistStagingModel[],
): Promise<Awaited<ReturnType<typeof bulkImportHistorical>>> => {
  let batchResult: Awaited<ReturnType<typeof bulkImportHistorical>>
  try {
    batchResult = await bulkImportHistorical({
      inbox: context.inbox,
      workspaceId: context.integration.workspaceId,
      runId: context.runId,
      batch: reduced.batch,
      aiReadsSyncedHistory: context.integration.coexistAiReadsSyncedHistory,
    })
  } catch (error) {
    state.failed += reduced.batch.reduce(
      (sum, item) => sum + item.messages.length,
      0,
    )
    state.totalRows += stagedRows.length
    logger.error(
      { error, runId: context.runId, batchNumber: state.batchNumber },
      "[coexist] WhatsApp bulk import threw — batch lost",
    )
    throw error
  }

  state.importedContacts += batchResult.importedContacts
  state.importedMessages += batchResult.importedMessages
  state.skipped += batchResult.skippedMessages + batchResult.skippedContacts
  state.failed += batchResult.failedMessages
  state.totalRows += stagedRows.length

  // Surface non-throw failure (e.g. workspace cap hit) so currentError is
  // populated even when bulkImportHistorical returns failedMessages > 0 without
  // raising. Otherwise the UI shows failedCount=N with an empty error.
  if (batchResult.failureReason) {
    state.currentError = `batch ${state.batchNumber}: ${batchResult.failureReason}`
  }
  return batchResult
}

/**
 * Marks this batch's rows processed — the bulk pipeline was atomic.
 * Cap-rejected contacts also count as processed (deterministic skip; a re-run
 * would not recover them). Unparseable rows are parked with `parseFailedAt`
 * instead, so they leave every later batch without being reported as imported.
 */
const markBatchStagingRows = async (
  stagedRows: WhatsappCoexistStagingModel[],
  reduced: ReducedBatch,
): Promise<void> => {
  const parkedIds = new Set(reduced.parseFailedRowIds)
  await whatsappCoexistStagingRepository.markProcessed({
    ids: stagedRows.map((row) => row.id).filter((id) => !parkedIds.has(id)),
  })
  await whatsappCoexistStagingRepository.markParseFailed({
    ids: reduced.parseFailedRowIds,
  })
}

/** Walks batches until the chunk budget, the staging table or the claim runs out. */
const drainRun = async (
  context: FlushContext,
  state: FlushState,
): Promise<DrainOutcome> => {
  while (Date.now() - context.jobStart < CHUNK_BUDGET_MS) {
    const outcome = await drainBatch(context, state)
    if (outcome === "lostClaim") {
      return "lostClaim"
    }
    if (outcome === "declined") {
      // A decline is a terminal signal in its own right: Meta will never send
      // history for this number, so the run must not park in `waiting`.
      await integrationWhatsappRepository.markHistoryDeclined({
        id: context.integration.id,
      })
      state.terminalSeen = true
      state.currentError = COEXIST_HISTORY_DECLINED_ERROR
      return "exhausted"
    }
    if (outcome === "exhausted") {
      return "exhausted"
    }
  }
  return "continueLater"
}

/**
 * Decides the run's status once the drain reports `exhausted`.
 *
 * Tail re-check first: rows can be staged between the loop's last empty query
 * and now. Finalizing then would orphan them — a buffer-triggered flush finds
 * no live run to claim — so the run is kept alive and the existing continuation
 * drains them (coalesced: one continuation, not one job per late webhook).
 * Parse-failed rows are excluded so a poison row cannot chain forever.
 *
 * @returns the status to write, or null to enqueue a continuation instead.
 */
const resolveFinalStatus = async (
  context: FlushContext,
  state: FlushState,
): Promise<FlushFinalStatus | null> => {
  const [tailRow] = await whatsappCoexistStagingRepository.listPending({
    phoneNumberId: context.phoneNumberId,
    limit: 1,
  })
  if (tailRow) {
    return null
  }

  if (
    state.terminalSeen ||
    // Resume seed: an earlier chunk of THIS run may have seen the terminal
    // entry and then yielded (time budget / late rows) without finalizing. The
    // persisted pair is the only memory of it across invocations, and because
    // the reduction is lexicographic by (phase, progress, …) the pair always
    // describes the furthest phase AND that phase's own progress — so this can
    // neither miss nor invent a terminal signal.
    isWhatsappHistoryTerminal({
      lastPhase: state.runMetadata?.phase ?? null,
      syncProgress: state.runMetadata?.progress ?? null,
    })
  ) {
    // Meta said it is done (last phase at 100%, or history declined): only now
    // may the run reach a terminal status.
    return resolveTerminalStatus(state)
  }

  // Everything staged so far is imported, but Meta is still pushing history.
  // Park the run instead of closing it: `finishedAt` stays NULL, counters are
  // persisted, and either the next buffer flush or the scheduler's recovery
  // pass wakes it when more rows land. The 24h window is enforced by the
  // scheduler, not here.
  return "waiting"
}

/**
 * Hands the run back before the continuation is queued.
 *
 * `claimRunWithNewToken` refuses a run that is `running` with a heartbeat under 10 minutes
 * old — that is what stops two workers driving one run. A continuation
 * enqueued while this worker still holds the claim therefore loses its own
 * claim and abandons, so the chunk chain has to release ownership first: back
 * to `init` with a fresh heartbeat, counters and pending patches untouched,
 * exactly as `resetForRetry` hands a run back after a transient error. The
 * refreshed `updatedAt` also keeps `pickDueRuns` (which only considers `init`
 * runs idle for 10s) from racing a second job in alongside the continuation.
 *
 * @returns false when the claim was already lost, in which case no
 * continuation is queued — whoever holds the run now is driving it.
 */
const releaseForContinuation = async (
  context: FlushContext,
): Promise<boolean> => {
  const written = await coexistService.updateProgress({
    runId: context.runId,
    expect: context.guard,
    fields: { status: "init", lastHeartbeatAt: new Date() },
  })

  return written > 0
}

/**
 * Hot-chains the next chunk. On enqueue failure the run is left `init` for the
 * scheduler rather than `running` with nobody driving it.
 */
const enqueueContinuation = async (
  context: FlushContext,
  state: FlushState,
): Promise<void> => {
  if (!(await releaseForContinuation(context))) {
    abandon(context, "release before continuation matched no rows")
    return
  }

  try {
    await integrationQueue.add(
      IntegrationJobAction.coexistWhatsappFlush,
      {
        type: IntegrationJobAction.coexistWhatsappFlush,
        data: { runId: context.runId, phoneNumberId: context.phoneNumberId },
      },
      {
        jobId: buildCoexistPageJobId({
          runId: context.runId,
          attempts: context.run.attempts,
          pageNumber: state.batchNumber + 1,
        }),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    )
    logger.info(
      {
        runId: context.runId,
        batchNumber: state.batchNumber,
        phoneNumberId: context.phoneNumberId,
      },
      "[coexist] WhatsApp flush chunk done — continuation enqueued",
    )
  } catch (error) {
    // The run is already `init` with a fresh heartbeat, so the scheduler's
    // next pass drives it — nothing left to write here, and the claim this
    // worker held is gone.
    logger.error(
      { error, runId: context.runId },
      "[coexist] WhatsApp continuation enqueue failed — fallback to scheduler",
    )
  }
}

/** The one terminal/parking write. @returns false when the claim was lost. */
const finalizeRun = async (
  context: FlushContext,
  state: FlushState,
  finalStatus: FlushFinalStatus,
): Promise<boolean> => {
  const finalized = await coexistService.updateProgress({
    runId: context.runId,
    expect: context.guard,
    fields: {
      status: finalStatus,
      // `waiting` is NOT an end: the run has drained what Meta sent so far and
      // is still open for the rest.
      finishedAt: finalStatus === "waiting" ? null : new Date(),
      lastHeartbeatAt: new Date(),
      currentScan: state.totalRows,
      currentStep: finalStatus === "waiting" ? "waiting for history" : "done",
      importedContactCount: state.importedContacts,
      importedMessageCount: state.importedMessages,
      skippedCount: state.skipped,
      failedCount: state.failed,
      currentError: state.currentError ?? null,
      pendingPatches: { entries: state.pendingPatches },
    },
  })
  return finalized > 0
}

/**
 * A thrown error is TRANSIENT until proven otherwise (a dropped connection, a
 * bulk-import hiccup). Terminalizing the run here used to strand every later
 * history payload: the retry found no live run to claim. Reset to `init` with
 * the counters intact and rethrow so BullMQ's own `attempts` and the
 * scheduler's MAX_ATTEMPTS + markMaxAttemptsFailed bound the retries and own
 * the eventual `failed`.
 *
 * @returns false when the run was torn down mid-flight — swallow the error then,
 *   because retrying a job whose run is gone only burns attempts.
 */
const handleDrainError = async (
  context: FlushContext,
  state: FlushState,
  error: unknown,
): Promise<boolean> => {
  state.currentError =
    error instanceof Error ? error.message : "Unknown error during flush"
  logger.error(error, "[coexist] WhatsApp flush chunk failed — will retry")
  await logProviderError({
    provider: "whatsapp",
    workspaceId: context.integration.workspaceId,
    error,
  })
  const reset = await coexistService.resetForRetry({
    runId: context.runId,
    currentError: state.currentError,
    expect: context.guard,
    fields: {
      currentScan: state.totalRows,
      importedContactCount: state.importedContacts,
      importedMessageCount: state.importedMessages,
      skippedCount: state.skipped,
      failedCount: state.failed,
      pendingPatches: { entries: state.pendingPatches },
    },
  })
  return reset > 0
}

const logChunkComplete = (
  context: FlushContext,
  state: FlushState,
  finalStatus: FlushFinalStatus | null,
  continued: boolean,
): void => {
  logger.info(
    {
      phoneNumberId: context.phoneNumberId,
      importedContacts: state.importedContacts,
      importedMessages: state.importedMessages,
      skipped: state.skipped,
      failed: state.failed,
      rows: state.totalRows,
      runId: context.runId,
      finalStatus,
      continued,
    },
    "[coexist] WhatsApp flush chunk complete",
  )
}

/**
 * Drains buffered WhatsApp staging rows into Contact/ContactInbox/Message via
 * the bulk pipeline. Page-per-job pattern: one chunk per invocation, then
 * either hot-chain a continuation enqueue or yield to the scheduler.
 *
 * Gated by `coexistEnabled` — a no-op when the user has not confirmed the
 * popup. Idempotent: safe to re-run as more history arrives over the ~24h
 * window Meta uses to push it.
 *
 * EXCLUSIVE OWNERSHIP. `claimRunWithNewToken` mints a `claimToken` on the run; every write
 * this handler makes afterwards is conditional on BOTH `status = 'running'` and
 * that token. A write that reports 0 rows therefore covers both ways the run
 * can move out from under us — a `disconnect`/`disable`/workspace teardown that
 * flipped it to `failed`, and a second worker that reclaimed it after a stale
 * heartbeat (which leaves the status `running` but replaces the token) — and
 * the handler abandons quietly: no continuation enqueue, no further staging
 * writes, no rethrow.
 *
 * Ownership is re-validated immediately before every batch import and before
 * every staging write, so the worst case is ONE in-flight `bulkImportHistorical`
 * overlapping the reclaim. Those inserts are idempotent (unique
 * (contactInbox, sourceId)), and only the reclaiming worker's progress and
 * finalize writes land, so counters cannot double-count and the terminal status
 * has exactly one author.
 */
export const coexistWhatsappFlush = async (
  data: IntegrationJobCoexistWhatsappFlush["data"],
): Promise<void> => {
  const context = await loadFlushContext(data)
  if (!context) {
    return
  }

  const state = seedState(context.run)

  let finalStatus: FlushFinalStatus | null = null
  let continueLater = false
  try {
    const outcome = await drainRun(context, state)
    if (outcome === "lostClaim") {
      abandon(context, "a guarded write matched no rows")
      return
    }
    if (outcome === "exhausted") {
      finalStatus = await resolveFinalStatus(context, state)
    }
    // `continueLater` is set either by the chunk time budget or by the tail
    // re-check finding rows staged after the drain. finalStatus stays null in
    // both cases, so the run is not finalized and a continuation keeps draining.
    continueLater = finalStatus === null
    if (continueLater) {
      await enqueueContinuation(context, state)
    }
  } catch (error) {
    finalStatus = null
    if (!(await handleDrainError(context, state, error))) {
      abandon(context, "reset after error matched no rows")
      return
    }
    throw error
  } finally {
    if (
      finalStatus !== null &&
      !(await finalizeRun(context, state, finalStatus))
    ) {
      abandon(context, `finalize to ${finalStatus} matched no rows`)
    }
  }

  logChunkComplete(context, state, finalStatus, continueLater)
}
