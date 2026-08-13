import {
  type SmartDelayRow,
  smartDelayService,
} from "@chatbotx.io/business/smart-delay"
import {
  type SmartDelayType,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import {
  buildJobId,
  ENQUEUE_DELAY_MS,
  type MetadataPayload,
  metadataSchema,
} from "@chatbotx.io/flow-config"
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
  metadata?: MetadataPayload
  sendFrom?: "inbox"
  appointmentId?: string
}

const parseResumeMetadata = (
  value: Record<string, unknown> | null,
): MetadataPayload | undefined => {
  if (!value) {
    return
  }

  const parsed = metadataSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const buildSendFlowResumeJob = (
  row: SmartDelayRow,
  extras?: SmartDelayResumeJobExtras,
): SmartDelayJobSpec => {
  const metadata = extras?.metadata ?? parseResumeMetadata(row.metadata)
  const appointmentId = extras?.appointmentId ?? row.appointmentId ?? undefined

  return {
    name: IntegrationJobAction.sendFlow,
    data: {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: row.conversationId,
        contactInboxId: row.contactInboxId,
        flowId: row.flowId,
        flowVersionId: row.flowVersionId ?? undefined,
        nodeId: row.nodeId ?? undefined,
        ...(metadata ? { metadata } : {}),
        ...(extras?.sendFrom ? { sendFrom: extras.sendFrom } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      },
    },
  }
}

const buildResumeFollowUpJob = (row: SmartDelayRow): SmartDelayJobSpec => ({
  name: IntegrationJobAction.resumeFollowUp,
  data: {
    type: IntegrationJobAction.resumeFollowUp,
    data: { smartDelayId: row.id },
  },
})

const buildResumeWaitJob = (row: SmartDelayRow): SmartDelayJobSpec => ({
  name: IntegrationJobAction.resumeWait,
  data: {
    type: IntegrationJobAction.resumeWait,
    data: { smartDelayId: row.id },
  },
})

export const smartDelayResumeJobFactories: Record<
  SmartDelayType,
  (row: SmartDelayRow, extras?: SmartDelayResumeJobExtras) => SmartDelayJobSpec
> = {
  [smartDelayTypes.enum.waitNode]: buildResumeWaitJob,
  [smartDelayTypes.enum.followUp]: buildResumeFollowUpJob,
}

const smartDelayPersistenceHandlers: Record<
  SmartDelayType,
  (row: SmartDelayRow) => Promise<SmartDelayRow>
> = {
  [smartDelayTypes.enum.waitNode]: async (data) => {
    await smartDelayService.create({ data })
    return data
  },
  [smartDelayTypes.enum.followUp]: async (data) =>
    await smartDelayService.upsertFollowUp({ data }),
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
  metadata?: MetadataPayload
  sendFrom?: "inbox"
  appointmentId?: string
}): Promise<void> {
  const rowId = createId()
  const row: SmartDelayRow = {
    id: rowId,
    workspaceId: props.workspaceId,
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    contactInboxId: props.contactInboxId,
    appointmentId: props.appointmentId ?? null,
    conversationId: props.conversationId,
    nodeId: props.connectedNodeId,
    stepId: props.stepId,
    metadata: props.metadata ?? null,
    type: props.type,
    createdAt: new Date(),
    triggerAt: props.triggerAt,
    status: smartDelayStatuses.enum.pending,
  }

  // Insert tracking record first so a crash during enqueue still has a recovery path via scanner.
  const persistedRow = await smartDelayPersistenceHandlers[props.type](row)

  const diffMs = persistedRow.triggerAt.getTime() - Date.now()
  if (diffMs > ENQUEUE_DELAY_MS) {
    return
  }

  try {
    await smartDelayService.markScheduled({ id: persistedRow.id })

    const job = smartDelayResumeJobFactories[persistedRow.type](persistedRow, {
      metadata: props.metadata,
      sendFrom: props.sendFrom,
      appointmentId: props.appointmentId,
    })
    await integrationQueue.add(job.name, job.data, {
      delay: Math.max(0, diffMs),
      jobId: buildJobId(persistedRow.id, persistedRow.triggerAt),
    })
  } catch (err) {
    try {
      await smartDelayService.resetToPending({ ids: [persistedRow.id] })
    } catch (resetErr) {
      logger.warn(
        { err: resetErr, rowId: persistedRow.id },
        "Failed to reset immediate smart delay after enqueue failure",
      )
    }
    logger.warn(
      { err, rowId: persistedRow.id },
      "Failed to immediately enqueue smart delay; scanner will pick it up",
    )
  }
}
