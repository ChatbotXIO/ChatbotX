import { coexistService } from "@chatbotx.io/business"
import type { PickedCoexistRun } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import { buildCoexistReviveJobSuffix } from "@chatbotx.io/worker-config"
import type { CoexistRunEnqueuer } from "./recovery-strategies"

const log = getChildLogger("coexist-whatsapp-recovery")

/** Rows touched per recovery query per tick — bounded so one tick stays cheap. */
const RECOVERY_BATCH = 200
/** New `scheduler-recovery` runs opened per tick. */
const STRANDED_LIMIT = 50

/**
 * Enqueues the runs pass 1 lifted out of `waiting`, with their CURRENT
 * attempts. A revive is new work arriving, not a retry: leaving it to
 * `pickDueRuns` would increment `attempts` on every history burst and drive an
 * otherwise-healthy run into "Max scheduler retries exceeded" after five.
 * `pickDueRuns` skips them on this tick because the revive stamped
 * `updatedAt`.
 *
 * The job id carries a `-revive-<uuid>` suffix: a revive deliberately reuses
 * the run's CURRENT attempts, so the plain `coexist-run-<id>-<attempts>` id may
 * already belong to a retained FAILED job (`removeOnFail: { count: 100 }`) —
 * BullMQ would then silently return that job instead of enqueuing, leaving
 * the revived run in `init` until the next tick rescued it.
 */
const enqueueRevivedRuns = async (
  runs: PickedCoexistRun[],
  enqueue: CoexistRunEnqueuer,
): Promise<void> => {
  const suffix = buildCoexistReviveJobSuffix()
  for (const run of runs) {
    try {
      await enqueue(run, suffix)
    } catch (err) {
      log.error({ err, runId: run.id }, "revived run enqueue failed")
    }
  }
}

/**
 * Opens a `scheduler-recovery` run for one WhatsApp integration whose staging
 * rows have no live run left to drain them, and enqueues it immediately —
 * `pickDueRuns` would otherwise ignore it for a tick (it requires
 * `updatedAt < NOW() - 10s`).
 */
const recoverStrandedIntegration = async (
  candidate: { integrationId: string; workspaceId: string },
  enqueue: CoexistRunEnqueuer,
): Promise<void> => {
  const run = await coexistService.createRun({
    workspaceId: candidate.workspaceId,
    integrationId: candidate.integrationId,
    channel: "whatsapp",
    triggerSource: "scheduler-recovery",
  })

  log.info(
    { runId: run.id, integrationId: candidate.integrationId },
    "opened scheduler-recovery run for stranded staging rows",
  )

  await enqueue({
    id: run.id,
    attempts: run.attempts,
    channel: run.channel,
    integrationId: run.integrationId,
    workspaceId: run.workspaceId,
  })
}

/**
 * WhatsApp's recovery pass, run before the normal pick pass every tick.
 *
 * Meta delivers Coexistence history in phases over minutes-to-24h, so a run
 * stays in `waiting` between chunks instead of being finalized. This pass owns
 * the three transitions out of that state:
 *
 *  1. more history arrived  → `waiting` back to `init` (no attempt burned)
 *  2. window elapsed, quiet → `partial` + `history_timeout`
 *  3. staging rows with no live run at all → a fresh `scheduler-recovery` run
 */
export const recoverWhatsappRuns = async (
  enqueue: CoexistRunEnqueuer,
): Promise<void> => {
  const revived = await coexistService.reviveWaitingRunsWithPendingStaging({
    batchSize: RECOVERY_BATCH,
  })
  if (revived.length > 0) {
    log.info(
      { count: revived.length },
      "revived waiting WhatsApp runs with new staging rows",
    )
    await enqueueRevivedRuns(revived, enqueue)
  }

  const timedOut = await coexistService.finalizeTimedOutWaitingRuns({
    batchSize: RECOVERY_BATCH,
  })
  if (timedOut.length > 0) {
    log.info(
      { count: timedOut.length },
      "finalized WhatsApp runs past the history window",
    )
  }

  const stranded = await coexistService.findStrandedCoexistWhatsappIntegrations(
    { limit: STRANDED_LIMIT },
  )
  for (const candidate of stranded) {
    try {
      await recoverStrandedIntegration(candidate, enqueue)
    } catch (err) {
      log.error(
        { err, integrationId: candidate.integrationId },
        "recovery run creation failed",
      )
    }
  }
}
