import { buildJobId } from "@chatbotx.io/flow-config"
import { integrationQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { smartDelayService } from "../smart-delay/service"

export const SMART_DELAY_CANCEL_BATCH_SIZE = 500
// Backstop so one workspace with a runaway backlog cannot spin the freeze call
// forever: 500 * 400 = 200k rows per call. Whatever is left is harmless — the
// worker-side guard no-ops those wake-ups, and the purge cascade removes the
// rows when the grace window expires.
const MAX_CANCEL_BATCHES = 400

/**
 * Cancels every still-firable smart-delay row of a workspace (wait steps,
 * follow-ups) and drops their delayed BullMQ jobs.
 *
 * Cancelling the row is the part that matters. A wake-up job for a `canceled`
 * row is already a no-op (`wait-resume` requires `status === 'scheduled'` and
 * `claimForRun` CASes on it), and — more importantly — the scanner's
 * stuck-scheduled sweeper can only reset rows that are still `scheduled`, so a
 * canceled row stops churning through claim → drop → reset for the rest of the
 * 24-hour grace window.
 */
export async function cancelSmartDelaysForWorkspace(props: {
  workspaceId: string
}): Promise<number> {
  let canceled = 0

  for (let batch = 0; batch < MAX_CANCEL_BATCHES; batch += 1) {
    const rows = await smartDelayService.cancelActiveForWorkspace({
      limit: SMART_DELAY_CANCEL_BATCH_SIZE,
      workspaceId: props.workspaceId,
    })

    if (rows.length === 0) {
      break
    }

    canceled += rows.length

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

    if (rows.length < SMART_DELAY_CANCEL_BATCH_SIZE) {
      break
    }
  }

  return canceled
}
