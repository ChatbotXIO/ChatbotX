import { buildJobId } from "@chatbotx.io/flow-config"
import { integrationQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { type SmartDelayRow, smartDelayService } from "../smart-delay/service"
import { drainInBatches } from "./purge-batch"

export const SMART_DELAY_CANCEL_BATCH_SIZE = 500
const MAX_CANCEL_BATCHES = 400

/**
 * Cancels every still-firable smart-delay row of a workspace (wait steps,
 * follow-ups) and drops their delayed BullMQ jobs.
 *
 * Cancelling the row is the part that matters. A wake-up job for a `canceled`
 * row is already a no-op (`wait-resume` requires `status === 'scheduled'` and
 * `claimForRun` CASes on it), and the scanner's stuck-scheduled sweeper can
 * only reset rows that are still `scheduled`.
 */
export async function cancelSmartDelaysForWorkspace(props: {
  deadlineAt: number
  workspaceId: string
}): Promise<number> {
  return await drainInBatches({
    afterBatch: async (rows: Pick<SmartDelayRow, "id" | "triggerAt">[]) => {
      // Best-effort: the rows are already canceled, so a job that survives is
      // inert. Never let a Redis hiccup abort the cancellation loop.
      const removals = await Promise.allSettled(
        rows.map((row) =>
          integrationQueue.remove(buildJobId(row.id, row.triggerAt)),
        ),
      )
      const failed = removals.filter((result) => result.status === "rejected")
      if (failed.length > 0) {
        logger.warn(
          { failedCount: failed.length, workspaceId: props.workspaceId },
          "workspace-freeze: failed to remove smart-delay jobs",
        )
      }
    },
    batchSize: SMART_DELAY_CANCEL_BATCH_SIZE,
    deadlineAt: props.deadlineAt,
    maxBatches: MAX_CANCEL_BATCHES,
    runBatch: async (tx) => {
      const rows = await smartDelayService.cancelActiveForWorkspace({
        limit: SMART_DELAY_CANCEL_BATCH_SIZE,
        tx,
        workspaceId: props.workspaceId,
      })
      return { count: rows.length, value: rows }
    },
    table: "ContactOnSmartDelay",
    workspaceId: props.workspaceId,
  })
}
