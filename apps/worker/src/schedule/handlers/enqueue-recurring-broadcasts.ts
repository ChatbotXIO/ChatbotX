import { broadcastRecurrenceService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import {
  MATERIALIZE_BATCH_SIZE,
  MATERIALIZE_RECURRING_BROADCASTS_PRIORITY,
  type MaterializeRecurringBroadcastItem,
  materializeBatchJobId,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { startOfMinute } from "date-fns"

const LOCK_KEY = "schedule:enqueue-recurring-broadcasts"
// Shorter than the one-minute cadence, so a crashed holder never blocks a tick.
const LOCK_TTL_SECONDS = 55
// Fail fast: a held lock means the previous tick is still running, and the
// schedule worker has few slots to spend waiting.
const LOCK_ACQUIRE_RETRY_SECONDS = 0
const DUE_PAGE_SIZE = 5000
const MAX_RECURRENCES_PER_TICK = 200_000
// Batches already pending (prioritized) or backing off for a retry (delayed)
// beyond which a tick adds no more: the database cursor keeps every slot due, so
// nothing is lost by waiting, whereas re-enqueueing the same still-due series
// every minute would grow Redis without bound while the schedule worker is down
// or behind. The delayed count also holds the schedule queue's few delayed cron
// runs, which is negligible against this limit.
const MAX_PENDING_BATCHES = MAX_RECURRENCES_PER_TICK / MATERIALIZE_BATCH_SIZE

const log = getChildLogger("enqueue-recurring-broadcasts")

export type EnqueueRecurringBroadcastsResult = {
  scanned: number
  enqueued: number
  skipped: boolean
}

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

const runEnqueue = async (): Promise<EnqueueRecurringBroadcastsResult> => {
  const [pending, delayed] = await Promise.all([
    scheduleQueue.getPrioritizedCount(),
    scheduleQueue.getDelayedCount(),
  ])
  if (pending + delayed >= MAX_PENDING_BATCHES) {
    log.warn(
      {
        pendingBatches: pending + delayed,
        oldestDueAgeMs: await broadcastRecurrenceService.findOldestDueAgeMs(),
      },
      "schedule queue is backlogged; tick skipped",
    )
    return { scanned: 0, enqueued: 0, skipped: true }
  }

  const dueAtMs = startOfMinute(new Date()).getTime()
  let cursor: { nextRunAt: Date; id: string } | null = null
  let scanned = 0
  let enqueued = 0

  for (let page = 0; enqueued < MAX_RECURRENCES_PER_TICK; page += 1) {
    const due = await broadcastRecurrenceService.listDue({
      limit: DUE_PAGE_SIZE,
      cursor,
    })
    if (due.length === 0) {
      break
    }
    scanned += due.length

    const items: MaterializeRecurringBroadcastItem[] = due.map((series) => ({
      recurrenceId: series.id,
      workspaceId: series.workspaceId,
      occurrenceAtMs: series.nextRunAt.getTime(),
    }))
    await scheduleQueue.addBulk(
      chunk(items, MATERIALIZE_BATCH_SIZE).map((batch, index) => ({
        name: ScheduleJobData.materializeRecurringBroadcasts,
        data: {
          type: ScheduleJobData.materializeRecurringBroadcasts,
          data: { items: batch },
        },
        opts: {
          // Deduplicates fan-out when this tick is retried; the items
          // themselves are idempotent, so a repeat is harmless either way.
          jobId: materializeBatchJobId(dueAtMs, page, index),
          priority: MATERIALIZE_RECURRING_BROADCASTS_PRIORITY,
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    )
    enqueued += items.length

    const last = due.at(-1)
    if (due.length < DUE_PAGE_SIZE || !last) {
      break
    }
    cursor = { nextRunAt: last.nextRunAt, id: last.id }
  }

  // The number an operator alerts on: it grows when the schedule worker or
  // Redis is unhealthy, since the database cursor keeps every slot due.
  const oldestDueAgeMs = await broadcastRecurrenceService.findOldestDueAgeMs()
  log.info(
    { scanned, enqueued, oldestDueAgeMs },
    "enqueued recurring broadcasts",
  )
  return { scanned, enqueued, skipped: false }
}

/**
 * Per-minute cron: finds the series whose slot is due (an index scan on the
 * small series table) and hands them back to the `schedule` queue as
 * low-priority `materializeRecurringBroadcasts` batches. Not workspace-scoped,
 * so — like `enqueueBroadcast` — it is not behind the blocked-owner guard; the
 * materializer is.
 */
export async function enqueueRecurringBroadcasts(): Promise<EnqueueRecurringBroadcastsResult> {
  try {
    return await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: runEnqueue,
    })
  } catch (err) {
    if (isLockAcquisitionError(err, LOCK_KEY)) {
      log.warn(
        "enqueueRecurringBroadcasts: previous tick still running, skipped",
      )
      return { scanned: 0, enqueued: 0, skipped: true }
    }
    throw err
  }
}
