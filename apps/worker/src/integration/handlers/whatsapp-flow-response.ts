import { whatsappFlowResponseService } from "@chatbotx.io/business"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import {
  type FlowNode,
  stepTypes,
  type WhatsappFlowStepSchema,
} from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isWhatsappFlowStep = (step: unknown): step is WhatsappFlowStepSchema => {
  if (!isRecord(step) || step.stepType !== stepTypes.enum.whatsappFlow) {
    return false
  }

  if (
    !(
      Array.isArray(step.buttons) &&
      step.buttons.every(
        (button) => isRecord(button) && typeof button.id === "string",
      )
    )
  ) {
    return false
  }

  return (
    isRecord(step.flow) &&
    typeof step.flow.sourceId === "string" &&
    Array.isArray(step.flow.fieldMappings)
  )
}

const getWhatsappFlowStepByButtonId = (
  step: unknown,
  buttonId: string,
): WhatsappFlowStepSchema | null => {
  if (!isWhatsappFlowStep(step)) {
    return null
  }

  return step.buttons.some((button) => button.id === buttonId) ? step : null
}

const findWhatsappFlowStepInList = (
  steps: unknown[],
  buttonId: string,
): WhatsappFlowStepSchema | null => {
  for (const step of steps) {
    const whatsappFlowStep = getWhatsappFlowStepByButtonId(step, buttonId)
    if (whatsappFlowStep) {
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
    const details = node.data.details

    if ("steps" in details && Array.isArray(details.steps)) {
      const found = findWhatsappFlowStepInList(details.steps, buttonId)
      if (found) {
        return found
      }
    }

    if ("beforeStep" in details) {
      const found = getWhatsappFlowStepByButtonId(details.beforeStep, buttonId)
      if (found) {
        return found
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

  await whatsappFlowResponseService.applyResponse({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
    contactInbox: props.contactInbox,
    flowSourceId,
    fieldMappings: props.step.flow.fieldMappings,
    flowResponse: props.flowResponse,
  })
}
