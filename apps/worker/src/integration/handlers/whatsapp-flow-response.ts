import { db, sql } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  whatsappFlowModel,
} from "@chatbotx.io/database/schema"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import {
  type FlowNode,
  stepTypes,
  type WhatsappFlowFieldMapping,
  type WhatsappFlowStepSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"

type AnyStep = { stepType: string; buttons?: Array<{ id: string }> }
type AnyDetails = {
  steps?: AnyStep[]
  beforeStep?: AnyStep
}

const findWhatsappFlowStepInList = (
  steps: AnyStep[],
  buttonId: string,
): WhatsappFlowStepSchema | null => {
  for (const step of steps) {
    if (step.stepType !== stepTypes.enum.whatsappFlow) {
      continue
    }
    const whatsappFlowStep = step as unknown as WhatsappFlowStepSchema
    if (whatsappFlowStep.buttons.find((b) => b.id === buttonId)) {
      return whatsappFlowStep
    }
  }
  return null
}

export const findWhatsappFlowStepByButtonId = (
  nodes: FlowNode[],
  buttonId: string,
): WhatsappFlowStepSchema | null => {
  for (const node of nodes) {
    const details = node.data.details as unknown as AnyDetails

    if (details.steps) {
      const found = findWhatsappFlowStepInList(details.steps, buttonId)
      if (found) {
        return found
      }
    }

    if (details.beforeStep) {
      const bs = details.beforeStep
      if (
        bs.stepType === stepTypes.enum.whatsappFlow &&
        bs.buttons?.find((b) => b.id === buttonId)
      ) {
        return bs as unknown as WhatsappFlowStepSchema
      }
    }
  }

  return null
}

export const applyWhatsappFlowResponseSideEffects = async (props: {
  workspaceId: string
  contactId: string
  contactInbox: ContactInboxModel
  step: WhatsappFlowStepSchema
  flowResponse: Record<string, unknown>
}) => {
  const flowSourceId = props.step.flow.sourceId
  if (!flowSourceId) {
    logger.warn(
      { flowId: props.step.flow.id },
      "[whatsapp-flow-response] step.flow.sourceId missing",
    )
    return
  }

  await Promise.all([
    incrementCompletedCount({
      contactInbox: props.contactInbox,
      flowSourceId,
    }),
    applyFieldMappings({
      workspaceId: props.workspaceId,
      contactId: props.contactId,
      mappings: props.step.flow.fieldMappings,
      flowResponse: props.flowResponse,
    }),
  ])
}

const incrementCompletedCount = async (props: {
  contactInbox: ContactInboxModel
  flowSourceId: string
}) => {
  const integrationWhatsapp = await db.query.integrationWhatsappModel.findFirst(
    {
      where: { inboxId: props.contactInbox.inboxId },
      columns: { id: true },
    },
  )

  if (!integrationWhatsapp) {
    logger.warn(
      { inboxId: props.contactInbox.inboxId },
      "IntegrationWhatsapp not found while incrementing flow completedCount",
    )
    return
  }

  await db
    .update(whatsappFlowModel)
    .set({
      completedCount: sql`${whatsappFlowModel.completedCount} + 1`,
    })
    .where(
      sql`${whatsappFlowModel.integrationWhatsappId} = ${integrationWhatsapp.id} AND ${whatsappFlowModel.sourceId} = ${props.flowSourceId}`,
    )
}

const applyFieldMappings = async (props: {
  workspaceId: string
  contactId: string
  mappings: WhatsappFlowFieldMapping[]
  flowResponse: Record<string, unknown>
}) => {
  const validMappings = props.mappings.filter(
    (
      mapping,
    ): mapping is WhatsappFlowFieldMapping & { customFieldId: string } =>
      Boolean(mapping.customFieldId),
  )

  if (validMappings.length === 0) {
    return
  }

  await Promise.all(
    validMappings.map((mapping) =>
      upsertContactCustomField({
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        mapping,
        rawValue: props.flowResponse[mapping.paramKey],
      }),
    ),
  )
}

const upsertContactCustomField = async (props: {
  workspaceId: string
  contactId: string
  mapping: WhatsappFlowFieldMapping & { customFieldId: string }
  rawValue: unknown
}) => {
  const value = serializeFlowValue(props.rawValue)
  if (value === null) {
    return
  }

  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: props.contactId,
      customFieldId: props.mapping.customFieldId,
    },
    columns: { value: true },
  })
  const oldValue = existing?.value ?? null

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      contactId: props.contactId,
      customFieldId: props.mapping.customFieldId,
      value,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: { value },
    })

  const fieldName = props.mapping.paramLabel ?? props.mapping.paramKey
  try {
    await emitCustomFieldChanged(
      props.workspaceId,
      props.contactId,
      props.mapping.customFieldId,
      fieldName,
      oldValue,
      value,
    )
  } catch (err) {
    logger.warn(
      { err },
      "[whatsapp-flow-response] Failed to emit customFieldChanged",
    )
  }
}

const serializeFlowValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null
  }
  if (typeof raw === "string") {
    return raw
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw)
  }
  try {
    return JSON.stringify(raw)
  } catch {
    return null
  }
}
