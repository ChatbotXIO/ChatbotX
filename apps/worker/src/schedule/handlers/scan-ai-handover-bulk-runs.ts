import { aiHandoverBulkRunService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:scan-ai-handover-bulk-runs"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5
const BATCH = 100
/** Pages reconciled per tick; the rest are reached on later ticks. */
const RECONCILE_BATCH = 50
/** Where the reconcile sweep resumes, so every Page is reached in turn. */
const RECONCILE_CURSOR_KEY = "schedule:scan-ai-handover-bulk-runs:cursor"
const RECONCILE_CURSOR_TTL_SECONDS = 60 * 60

const log = getChildLogger("scan-ai-handover-bulk-runs")

function isLockAcquisitionFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    "code" in err &&
    "key" in err &&
    err.name === "LockAcquisitionError" &&
    err.code === "LOCK_ACQUISITION_FAILED" &&
    err.key === LOCK_KEY
  )
}

async function dispatchDueRuns(): Promise<void> {
  const picked = await aiHandoverBulkRunService.pickDue({ batchSize: BATCH })
  if (picked.length === 0) {
    return
  }
  log.info({ count: picked.length }, "scanAiHandoverBulkRuns: picked runs")

  for (const run of picked) {
    try {
      // A chunk still waiting in a backed-up queue is not lost: dispatching
      // another would only burn the run's retry budget.
      if (await aiHandoverBulkRunService.refundIfPreviousChunkQueued(run)) {
        continue
      }
      await aiHandoverBulkRunService.enqueueChunk(run)
    } catch (err) {
      log.error(
        { err, runId: run.id },
        "scanAiHandoverBulkRuns: enqueue failed",
      )
    }
  }
}

/**
 * The safety net of the desired-state reconciliation: a Page whose latest
 * revision has no run (its creation was interrupted, or it waited for a run to
 * stop) gets one now. The sweep walks the Pages by id from a stored cursor and
 * wraps around, so Pages that must keep waiting (an ON outside its schedule)
 * can never crowd the due ones out.
 */
async function reconcileAwaitingPages(): Promise<void> {
  const cursor = await distributedStore.get<string>(RECONCILE_CURSOR_KEY)
  let pages = await aiHandoverBulkRunService.listInboxesAwaitingRun({
    limit: RECONCILE_BATCH,
    afterInboxId: cursor,
  })
  if (pages.length === 0 && cursor) {
    // The end of the sweep: start again from the first Page.
    pages = await aiHandoverBulkRunService.listInboxesAwaitingRun({
      limit: RECONCILE_BATCH,
    })
  }

  for (const page of pages) {
    try {
      await aiHandoverBulkRunService.reconcile(page)
    } catch (err) {
      log.error(
        { err, inboxId: page.inboxId },
        "scanAiHandoverBulkRuns: reconcile failed",
      )
    }
  }

  const last = pages.at(-1)
  if (last && pages.length === RECONCILE_BATCH) {
    await distributedStore.put(
      RECONCILE_CURSOR_KEY,
      last.inboxId,
      RECONCILE_CURSOR_TTL_SECONDS,
    )
  } else {
    await distributedStore.delete(RECONCILE_CURSOR_KEY)
  }
}

/**
 * Runs every minute (`register-schedules.ts`). Terminalizes bulk runs the
 * sweeper retried to exhaustion, then re-dispatches every due run: a `pending`
 * run whose first enqueue was lost, a run whose worker died (stale lease), or a
 * released continuation nobody re-claimed. Mirrors `scanContactScans`.
 */
export async function scanAiHandoverBulkRuns(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        await aiHandoverBulkRunService.markMaxAttemptsFailed()
        await dispatchDueRuns()
        await reconcileAwaitingPages()
      },
    })
  } catch (err) {
    if (
      isLockAcquisitionFailure(err) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "scanAiHandoverBulkRuns: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
