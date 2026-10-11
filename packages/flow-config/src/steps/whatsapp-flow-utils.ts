import type { FlowNode } from "../nodes"
import { stepTypes } from "./step-action"
import type { WhatsappFlowStepSchema } from "./whatsapp-flow"

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

/**
 * The "Send WhatsApp Flow" step whose button carries `buttonId` — the id a
 * Flow response's `flow_token` decodes to. Shared by the worker (applying the
 * response) and the builder (labelling it).
 */
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
