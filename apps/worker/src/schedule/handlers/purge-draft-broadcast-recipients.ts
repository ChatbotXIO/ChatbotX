import { broadcastService } from "@chatbotx.io/business"
import { DelayedError } from "bullmq"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import {
  type DeferrableJob,
  deferralsSoFar,
} from "../../lib/lock-contention-deferral"
import { logger } from "../../lib/logger"

/**
 * Pacing of a draft's leftover-recipient cleanup. Each pass is bounded by
 * `broadcastService.purgeDraftRecipients`; between passes the job waits in
 * BullMQ's delayed set, so the shared schedule-worker slot serves other jobs.
 * Past `maxPasses` the job stops: the next re-schedule attempt of the draft
 * queues it again, so the draft is never stuck for good.
 */
export const PURGE_DRAFT_RECIPIENTS_POLICY = {
  retryDelayMs: 5000,
  maxPasses: 120,
} as const

/**
 * Clears the recipients a draft still holds from a prepare that `moveToDraft`
 * interrupted. Until that is done, `scheduleDraft` refuses to schedule it.
 */
export const purgeDraftBroadcastRecipients = async ({
  job,
  token,
  workspaceId,
  broadcastId,
}: {
  job: DeferrableJob
  token: string | undefined
  workspaceId: string
  broadcastId: string
}): Promise<void> => {
  if (await isBlockedWorkspace(workspaceId)) {
    return
  }

  const { done } = await broadcastService.purgeDraftRecipients({ broadcastId })
  if (done) {
    return
  }

  const passes = deferralsSoFar(job)
  if (
    token === undefined ||
    passes >= PURGE_DRAFT_RECIPIENTS_POLICY.maxPasses
  ) {
    logger.warn(
      { broadcastId, passes },
      "purgeDraftBroadcastRecipients: leftover recipients remain, stopping until the draft is re-scheduled",
    )
    return
  }

  await job.moveToDelayed(
    Date.now() + PURGE_DRAFT_RECIPIENTS_POLICY.retryDelayMs,
    token,
  )
  throw new DelayedError()
}
