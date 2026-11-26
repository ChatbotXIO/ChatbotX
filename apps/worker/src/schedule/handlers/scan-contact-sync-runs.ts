import { contactSyncService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:scan-contact-sync-runs"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5
const BATCH = 100

const log = getChildLogger("scan-contact-sync-runs")

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

async function sweepFollowUps(): Promise<void> {
  try {
    const linked = await contactSyncService.sweepFollowUps()
    if (linked > 0) {
      log.info({ linked }, "scanContactSyncRuns: handed off history syncs")
    }
  } catch (err) {
    // The runs above already ran: a failing sweep retries on the next tick.
    log.error({ err }, "scanContactSyncRuns: follow-up sweep failed")
  }
}

async function dispatchDueRuns(): Promise<void> {
  const picked = await contactSyncService.pickDue({ batchSize: BATCH })
  if (picked.length === 0) {
    return
  }
  log.info({ count: picked.length }, "scanContactSyncRuns: picked runs")

  for (const run of picked) {
    try {
      // A chunk still waiting in a backed-up queue is not lost: dispatching
      // another would only burn the run's retry budget.
      if (await contactSyncService.refundIfPreviousChunkQueued(run)) {
        continue
      }
      await contactSyncService.enqueueChunk(run)
    } catch (err) {
      log.error({ err, runId: run.id }, "scanContactSyncRuns: enqueue failed")
    }
  }
}

/**
 * Runs every minute (`register-schedules.ts`). Terminalizes runs retried to
 * exhaustion, then re-dispatches every due run: a `pending` run whose first
 * enqueue was lost, a run whose worker died (stale lease), or a released
 * continuation nobody re-claimed, and hands off the history sync of closed
 * connect-import items still owing one. Mirrors `scanAiHandoverBulkRuns`.
 */
export async function scanContactSyncRuns(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        await contactSyncService.markMaxAttemptsFailed()
        await dispatchDueRuns()
        // Independent of any run being due: closed items still owing their
        // history sync, whichever path closed them.
        await sweepFollowUps()
      },
    })
  } catch (err) {
    if (
      isLockAcquisitionFailure(err) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "scanContactSyncRuns: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
