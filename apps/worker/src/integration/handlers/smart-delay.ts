import {
  type SmartDelayRow,
  smartDelayService,
} from "@chatbotx.io/business/smart-delay"
import {
  type SmartDelayType,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import { buildJobId, ENQUEUE_DELAY_MS } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

type SmartDelayJobSpec = {
  name: IntegrationJobData["type"]
  data: IntegrationJobData
}

type SmartDelayResumeJobExtras = {
  sendFrom?: "inbox"
}

export const buildSendFlowResumeJob = (
  row: SmartDelayRow,
  extras?: SmartDelayResumeJobExtras,
): SmartDelayJobSpec => ({
  name: IntegrationJobAction.sendFlow,
  data: {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: row.conversationId,
      contactInboxId: row.contactInboxId,
      flowId: row.flowId,
      flowVersionId: row.flowVersionId ?? undefined,
      nodeId: row.nodeId ?? undefined,
      ...(extras?.sendFrom ? { sendFrom: extras.sendFrom } : {}),
    },
  },
})

const buildResumeFollowUpJob = (row: SmartDelayRow): SmartDelayJobSpec => ({
  name: IntegrationJobAction.resumeFollowUp,
  data: {
    type: IntegrationJobAction.resumeFollowUp,
    data: { smartDelayId: row.id },
  },
})

export const smartDelayResumeJobFactories: Record<
  SmartDelayType,
  (row: SmartDelayRow, extras?: SmartDelayResumeJobExtras) => SmartDelayJobSpec
> = {
  [smartDelayTypes.enum.waitNode]: buildSendFlowResumeJob,
  [smartDelayTypes.enum.followUp]: buildResumeFollowUpJob,
}

export async function scheduleSmartDelayResume(props: {
  type: SmartDelayType
  triggerAt: Date
  workspaceId: string
  flowId: string
  flowVersionId: string | null
  conversationId: string
  contactInboxId: string
  connectedNodeId: string
  stepId: string
  sendFrom?: "inbox"
}): Promise<void> {
  const rowId = createId()
  const row: SmartDelayRow = {
    id: rowId,
    workspaceId: props.workspaceId,
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    contactInboxId: props.contactInboxId,
    conversationId: props.conversationId,
    nodeId: props.connectedNodeId,
    stepId: props.stepId,
    type: props.type,
    createdAt: new Date(),
    triggerAt: props.triggerAt,
    status: smartDelayStatuses.enum.pending,
  }

  // Insert tracking record first so a crash during enqueue still has a recovery path via scanner.
  await smartDelayService.create({ data: row })

  const diffMs = props.triggerAt.getTime() - Date.now()
  if (diffMs > ENQUEUE_DELAY_MS) {
    return
  }

  try {
    const job = smartDelayResumeJobFactories[props.type](row, {
      sendFrom: props.sendFrom,
    })
    await integrationQueue.add(job.name, job.data, {
      delay: Math.max(0, diffMs),
      jobId: buildJobId(rowId),
    })
    await smartDelayService.markCompleted({ id: rowId })
  } catch (err) {
    logger.warn(
      { err, rowId },
      "Failed to immediately enqueue smart delay; scanner will pick it up",
    )
  }
}
