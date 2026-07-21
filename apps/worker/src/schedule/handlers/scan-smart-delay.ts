import {
  type SmartDelayRow,
  smartDelayService,
} from "@chatbotx.io/business/smart-delay"
import { buildJobId, ENQUEUE_DELAY_MS } from "@chatbotx.io/flow-config"
import { integrationQueue } from "@chatbotx.io/worker-config"
import { endOfMinute, subMilliseconds } from "date-fns"
import { smartDelayResumeJobFactories } from "../../integration/handlers/smart-delay"
import { logger } from "../../lib/logger"

// This table can grow by hundreds of thousands of rows per minute, so every
// step works in bounded batches. Per-run caps keep one cron tick from hogging
// the schedule worker; the backlog carries over to the next tick, and
// FOR UPDATE SKIP LOCKED inside claimDueRows lets overlapping runs split the
// work instead of double-claiming.
const SCAN_BATCH_SIZE = 500
const MAX_SWEEP_BATCHES_PER_RUN = 20
const MAX_CLAIM_BATCHES_PER_RUN = 200
const STUCK_SCHEDULED_GRACE_MS = 10 * 60 * 1000

const sweepStuckScheduled = async (olderThan: Date): Promise<void> => {
  let swept = 0
  let failedRemovals = 0
  let lastBatchSize = 0

  for (let batch = 0; batch < MAX_SWEEP_BATCHES_PER_RUN; batch++) {
    const stuckRows = await smartDelayService.listStuckScheduled({
      olderThan,
      limit: SCAN_BATCH_SIZE,
    })
    lastBatchSize = stuckRows.length
    if (stuckRows.length === 0) {
      break
    }

    // Remove the stale wake-up jobs FIRST: their deterministic jobId would make
    // the scanner's re-add a silent BullMQ "duplicated" no-op while a stuck
    // delayed or failed job still occupies the id. Removal is best-effort in
    // both directions: a rejection is just Redis flakiness, and an
    // actively-processing job RESOLVES with 0 (it cannot be removed) — either
    // way correctness is guaranteed by the CAS inside resetToPending, which
    // only touches rows that are still 'scheduled'.
    const removals = await Promise.allSettled(
      stuckRows.map((row) =>
        integrationQueue.remove(buildJobId(row.id, row.triggerAt)),
      ),
    )
    failedRemovals += removals.filter(
      (removal) => removal.status === "rejected",
    ).length

    swept += await smartDelayService.resetToPending({
      ids: stuckRows.map((row) => row.id),
      triggerAtBefore: olderThan,
    })

    if (stuckRows.length < SCAN_BATCH_SIZE) {
      break
    }
  }

  if (swept > 0) {
    logger.warn(
      { count: swept, failedRemovals },
      "Reset stuck scheduled smart delay rows to pending",
    )
  }
  if (lastBatchSize === SCAN_BATCH_SIZE) {
    logger.warn(
      { maxBatches: MAX_SWEEP_BATCHES_PER_RUN, batchSize: SCAN_BATCH_SIZE },
      "Smart delay sweep hit its per-run batch cap; backlog remains for the next tick",
    )
  }
}

const enqueueClaimedBatch = async (claimed: SmartDelayRow[]) => {
  const terminalRows = claimed.filter((row) => !row.nodeId)
  if (terminalRows.length > 0) {
    // allSettled: one failed terminal update must not abort the enqueueable
    // part of an already-claimed batch; a failed row stays 'scheduled' and the
    // stuck-sweep recovers it on a later tick.
    const results = await Promise.allSettled(
      terminalRows.map((row) =>
        smartDelayService.claimForRun({ id: row.id, to: "completed" }),
      ),
    )
    const failed = results.filter((result) => result.status === "rejected")
    if (failed.length > 0) {
      logger.error(
        { count: failed.length },
        "Failed to complete some terminal smart delay rows; sweep will retry them",
      )
    }
    logger.info(
      { ids: terminalRows.map((row) => row.id) },
      "Smart delay rows without nodeId marked completed (terminal wait)",
    )
  }

  const enqueueable = claimed.filter((row) => row.nodeId)
  if (enqueueable.length === 0) {
    return 0
  }

  try {
    await integrationQueue.addBulk(
      enqueueable.map((row) => {
        const job = smartDelayResumeJobFactories[row.type](row)
        return {
          name: job.name,
          data: job.data,
          opts: {
            jobId: buildJobId(row.id, row.triggerAt),
            delay: Math.max(0, row.triggerAt.getTime() - Date.now()),
          },
        }
      }),
    )
    return enqueueable.length
  } catch (err) {
    logger.error(
      { err, ids: enqueueable.map((row) => row.id) },
      "Failed to enqueue smart delay batch, resetting to pending for retry",
    )

    try {
      await smartDelayService.resetToPending({
        ids: enqueueable.map((row) => row.id),
      })
    } catch (updateErr) {
      logger.error(
        { err: updateErr, ids: enqueueable.map((row) => row.id) },
        "Failed to reset smart delay batch status to pending",
      )
    }
    return 0
  }
}

export const scanSmartDelay = async () => {
  const now = new Date()
  const windowUntil = endOfMinute(new Date(now.getTime() + ENQUEUE_DELAY_MS))

  // A sweep hiccup must never block claiming fresh due rows in the same tick.
  try {
    await sweepStuckScheduled(subMilliseconds(now, STUCK_SCHEDULED_GRACE_MS))
  } catch (err) {
    logger.error({ err }, "Smart delay sweep failed; continuing with claim")
  }

  let scanned = 0
  let enqueued = 0
  let lastBatchSize = 0

  for (let batch = 0; batch < MAX_CLAIM_BATCHES_PER_RUN; batch++) {
    const claimed = await smartDelayService.claimDueRows({
      windowUntil,
      limit: SCAN_BATCH_SIZE,
    })
    lastBatchSize = claimed.length
    if (claimed.length === 0) {
      break
    }

    scanned += claimed.length
    enqueued += await enqueueClaimedBatch(claimed)

    if (claimed.length < SCAN_BATCH_SIZE) {
      break
    }
  }

  if (lastBatchSize === SCAN_BATCH_SIZE) {
    logger.warn(
      { scanned, maxBatches: MAX_CLAIM_BATCHES_PER_RUN },
      "Smart delay claim hit its per-run batch cap; backlog remains for the next tick",
    )
  }

  return { scanned, enqueued }
}
