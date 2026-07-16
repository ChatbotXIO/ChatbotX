import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import {
  IntegrationJobAction,
  type IntegrationJobResumeWait,
} from "@chatbotx.io/worker-config"
import { runFlowNode } from "./flow"
import { buildSendFlowResumeJob } from "./smart-delay"

export async function runWaitResume(
  data: IntegrationJobResumeWait["data"],
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

  const job = buildSendFlowResumeJob(row)
  if (job.data.type !== IntegrationJobAction.sendFlow) {
    return
  }

  await runFlowNode(job.data.data)
}
