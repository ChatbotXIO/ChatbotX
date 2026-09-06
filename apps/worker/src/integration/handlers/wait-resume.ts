import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import {
  IntegrationJobAction,
  type IntegrationJobResumeWait,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { runFlowNode } from "./flow"
import { buildSendFlowResumeJob } from "./smart-delay"

export async function runWaitResume(
  data: IntegrationJobResumeWait["data"],
  parentJob?: Job,
): Promise<void> {
  const row = await smartDelayService.findById({ id: data.smartDelayId })
  if (
    !row ||
    row.type !== smartDelayTypes.enum.waitNode ||
    row.status !== smartDelayStatuses.enum.scheduled ||
    !row.nodeId
  ) {
    return
  }

  if (row.triggerAt.getTime() > Date.now()) {
    return
  }

  const claimed = await smartDelayService.claimForRun({
    id: row.id,
    to: smartDelayStatuses.enum.completed,
  })
  if (!claimed) {
    return
  }

  const resumeJob = buildSendFlowResumeJob(row)
  if (resumeJob.data.type !== IntegrationJobAction.sendFlow) {
    return
  }

  try {
    await runFlowNode(resumeJob.data.data, {
      flowExecutionKey: parentJob?.id,
    })
  } catch (error) {
    // claimForRun is the concurrency guard. Restore the row before letting
    // BullMQ retry so the next attempt can claim and resume this flow again.
    try {
      const requeued = await smartDelayService.requeueClaimedRun({ id: row.id })
      if (!requeued) {
        logger.error(
          { smartDelayId: row.id },
          "Failed to requeue a claimed wait smart delay after flow failure",
        )
      }
    } catch (requeueError) {
      logger.error(
        {
          err: normalizeError(requeueError),
          smartDelayId: row.id,
        },
        "Failed to requeue a claimed wait smart delay after flow failure",
      )
    }
    throw error
  }
}
