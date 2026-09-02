import {
  hardDeleteBroadcast,
  hasBroadcastRecipients,
  listPurgeableBroadcasts,
  type PurgeStopReason,
  purgeBroadcastRecipients,
} from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { PURGE_BROADCAST_CONCURRENCY } from "@chatbotx.io/worker-config"

const LOCK_KEY = "schedule:purge-broadcasts"
const log = getChildLogger("purge-broadcasts")
const LOCK_TTL_SECONDS = 10 * 60
/**
 * Fail-fast lock acquisition: `retryTimeoutInSeconds: 0` means zero retry
 * attempts (`distributed-lock.ts` computes `retryAttempts =
 * Math.ceil(retryTimeout / 200)`, so a 0-second retry budget is 0 attempts).
 * The schedule worker only has 5 shared slots; if this cron queued behind a
 * held lock the way `purgeWorkspaces` does, it could tie up one of those
 * slots for the full lock TTL instead of failing immediately and letting the
 * next 5-minute tick try again.
 */
const LOCK_ACQUIRE_RETRY_SECONDS = 0
const CANDIDATE_LIMIT = 50
const CHUNK_SIZE = 1000
const INTER_CHUNK_DELAY_MS = 100
/**
 * Wall-clock budget for one run, checked cooperatively (not a cancellation —
 * an in-flight chunk delete always finishes). Threaded into each
 * `purgeBroadcastRecipients` call as the *remaining* budget so a broadcast
 * purged late in the run gets a smaller slice, never more than what's left.
 */
const MAX_RUN_DURATION_MS = 4 * 60 * 1000

let isPurgeBroadcastsRunning = false

/**
 * Chunk-deletes `ContactOnBroadcast` recipient rows for soft-deleted
 * broadcasts and hard-deletes the `Broadcast` row once fully drained.
 *
 * The distributed lock IS the claim: `listPurgeableBroadcasts` runs under
 * the lock, so no separate row-level claim step is needed — a lost lock
 * mid-run just means the next tick re-lists the same candidates (purging is
 * idempotent; chunk deletes use `SKIP LOCKED` and `hardDeleteBroadcast`
 * re-checks its own predicate).
 */
export async function purgeBroadcasts(): Promise<void> {
  if (isPurgeBroadcastsRunning) {
    log.warn("purgeBroadcasts: skipped because a local purge is still running")
    return
  }

  isPurgeBroadcastsRunning = true
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: runPurge,
    })
  } catch (err) {
    if (isLockAcquisitionFailure(err)) {
      if (await isPurgeBroadcastsLockHeld()) {
        log.warn(
          { err },
          "purgeBroadcasts: skipped because another purge still holds the lock",
        )
        return
      }

      // Lock acquisition failed but the key is NOT held: with zero retry
      // attempts this almost always means the acquisition command itself
      // never reached Redis (e.g. Redis unreachable), not genuine overlap.
      // Log distinctly so an outage isn't masked as a routine skip, then
      // rethrow so it surfaces as a job failure instead of a silent no-op.
      log.warn(
        { err },
        "purgeBroadcasts: lock acquisition failed and the lock is not held — likely an infrastructure issue (e.g. Redis unreachable)",
      )
    }

    throw err
  } finally {
    isPurgeBroadcastsRunning = false
  }
}

async function isPurgeBroadcastsLockHeld(): Promise<boolean> {
  return await distributedStore.exists(LOCK_KEY)
}

type PurgeOneResult = {
  deleted: number
  stopReason: PurgeStopReason
  hardDeleted: boolean
}

async function runPurge(): Promise<void> {
  const deadline = Date.now() + MAX_RUN_DURATION_MS
  const candidates = await listPurgeableBroadcasts(CANDIDATE_LIMIT)

  const results = await mapWithConcurrency(
    candidates,
    PURGE_BROADCAST_CONCURRENCY,
    (candidate) => purgeOne(candidate.id, deadline),
  )

  const summary = results.reduce(
    (acc, result) => {
      if (result.status === "rejected") {
        log.error(
          { err: result.reason },
          "purgeBroadcasts: one broadcast failed to purge",
        )
        return acc
      }

      const { deleted, stopReason, hardDeleted } = result.value
      return {
        recipientsDeleted: acc.recipientsDeleted + deleted,
        broadcastsDeleted: acc.broadcastsDeleted + (hardDeleted ? 1 : 0),
        stopReasons: {
          ...acc.stopReasons,
          [stopReason]: (acc.stopReasons[stopReason] ?? 0) + 1,
        },
      }
    },
    {
      recipientsDeleted: 0,
      broadcastsDeleted: 0,
      stopReasons: {} as Partial<Record<PurgeStopReason, number>>,
    },
  )

  log.info(
    { claimed: candidates.length, ...summary },
    "purgeBroadcasts: summary",
  )
}

/**
 * A short/empty final chunk (`drained`) only means nothing was claimable
 * right now — `SKIP LOCKED` steps over rows another transaction currently
 * holds. So the hard delete is gated behind an EXISTS probe on the drained
 * path only; `deadline`/`chunkCap` exits never probe and always leave the
 * broadcast for the next tick, since an undrained broadcast still has rows
 * left by definition.
 */
async function purgeOne(
  broadcastId: string,
  deadline: number,
): Promise<PurgeOneResult> {
  const remaining = Math.max(0, deadline - Date.now())
  const { deleted, stopReason } = await purgeBroadcastRecipients({
    broadcastId,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxRunDurationMs: remaining,
  })

  if (stopReason !== "drained") {
    return { deleted, stopReason, hardDeleted: false }
  }

  const stillHasRecipients = await hasBroadcastRecipients(broadcastId)
  if (stillHasRecipients) {
    return { deleted, stopReason, hardDeleted: false }
  }

  const hardDeleted = await hardDeleteBroadcast(broadcastId)
  return { deleted, stopReason, hardDeleted }
}

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
