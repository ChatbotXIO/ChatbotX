import { broadcastRecurrenceService } from "@chatbotx.io/business"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  broadcastPrepareJobId,
  MATERIALIZE_ITEM_CONCURRENCY,
  type MaterializeRecurringBroadcastItem,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

/**
 * Gets the new run prepared right away instead of waiting for the next
 * `enqueueBroadcast` tick, which stays the fallback. The job id is the one that
 * tick uses, so the two producers can never prepare a run twice. Best effort:
 * the run is already committed, so a Redis hiccup here must not fail the job.
 */
const enqueuePrepare = async (broadcastId: string): Promise<void> => {
  try {
    await scheduleQueue.add(
      ScheduleJobData.prepareBroadcast,
      {
        type: ScheduleJobData.prepareBroadcast,
        data: { broadcastId },
      },
      {
        jobId: broadcastPrepareJobId(broadcastId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
  } catch (err) {
    logger.warn(
      { err, broadcastId },
      "Could not enqueue prepare for a new run; the next schedule tick will",
    )
  }
}

const materializeOne = async (
  item: MaterializeRecurringBroadcastItem,
): Promise<void> => {
  const slot = {
    recurrenceId: item.recurrenceId,
    workspaceId: item.workspaceId,
    occurrenceAt: new Date(item.occurrenceAtMs),
  }
  await runJobWithAuditContext(
    {
      workspaceId: item.workspaceId,
      source: "broadcastRecurrence:materialize",
    },
    async () => {
      // A blocked owner's slot is skipped (and the series moves on) rather than
      // left due: leaving it would keep the oldest slots at the head of every
      // scan and starve healthy series behind them.
      if (await isBlockedWorkspace(item.workspaceId)) {
        await broadcastRecurrenceService.skipOccurrence({
          ...slot,
          reason: "blockedOwner",
        })
        return
      }
      const result =
        await broadcastRecurrenceService.materializeOccurrence(slot)
      if (result.createdBroadcastId) {
        await enqueuePrepare(result.createdBroadcastId)
      }
    },
  )
}

/**
 * One batch job: every series is materialized in its own transaction, with a
 * failure isolated to its series. The job fails afterwards if any series did,
 * so BullMQ retries — safe, because each slot is idempotent.
 */
export async function materializeRecurringBroadcasts(
  items: readonly MaterializeRecurringBroadcastItem[],
): Promise<void> {
  const results = await mapWithConcurrency(
    items,
    MATERIALIZE_ITEM_CONCURRENCY,
    materializeOne,
  )

  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ reason: result.reason, recurrenceId: items[index]?.recurrenceId }]
      : [],
  )
  for (const failure of failures) {
    logger.error(
      { err: failure.reason, recurrenceId: failure.recurrenceId },
      "Failed to materialize a recurring broadcast slot",
    )
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `${failures.length} of ${items.length} recurring broadcast slots failed`,
    )
  }
}
