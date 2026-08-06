import type {
  ButtonSubType,
  SendWaTemplateMessageStepSchema,
  TemplateComponent,
  TemplateComponentButton,
  TemplateComponentCard,
} from "./send-wa-message-template"
import { toOptionalString } from "./send-wa-message-template"
import { stepTypes } from "./step-action"

export type ParameterInfo = {
  type: "header" | "body" | "button" | "carousel" | "limited_time_offer"
  index: number
  paramName: string
  format?: string
  buttonIndex?: number
  buttonSubType?: ButtonSubType
  flowSourceId?: string
  navigateScreenId?: string
  cardIndex?: number
}

function extractButtonParameterInfos(
  buttons: TemplateComponentButton[],
  cardIndex?: number,
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  for (const [buttonIdx, button] of buttons.entries()) {
    const buttonType = button.type.toUpperCase()

    if (buttonType === "URL" && button.url?.includes("{{1}}")) {
      params.push({
        type: "button",
        index: 0,
        paramName: "1",
        buttonIndex: buttonIdx,
        buttonSubType: "url",
        cardIndex,
      })
    } else if (buttonType === "COPY_CODE") {
      params.push({
        type: "button",
        index: 0,
        paramName: "coupon_code",
        buttonIndex: buttonIdx,
        buttonSubType: "copy_code",
        format: "coupon_code",
        cardIndex,
      })
    } else if (buttonType === "QUICK_REPLY") {
      params.push({
        type: "button",
        index: 0,
        paramName: "payload",
        buttonIndex: buttonIdx,
        buttonSubType: "quick_reply",
        format: "quick_reply",
        cardIndex,
      })
    } else if (buttonType === "FLOW") {
      params.push({
        type: "button",
        index: 0,
        paramName: "flow",
        buttonIndex: buttonIdx,
        buttonSubType: "flow",
        format: "flow",
        flowSourceId: toOptionalString(button.flow_id),
        navigateScreenId: toOptionalString(button.navigate_screen),
        cardIndex,
      })
    } else if (buttonType === "CATALOG") {
      params.push({
        type: "button",
        index: 0,
        paramName: "catalog",
        buttonIndex: buttonIdx,
        buttonSubType: "catalog",
        format: "catalog",
        cardIndex,
      })
    } else if (buttonType === "MPM") {
      params.push({
        type: "button",
        index: 0,
        paramName: "mpm",
        buttonIndex: buttonIdx,
        buttonSubType: "mpm",
        format: "mpm",
        cardIndex,
      })
    }
  }

  return params
}

type StepBearingNode = {
  data: {
    details: {
      steps?: readonly unknown[]
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isStepBearingNode = (node: unknown): node is StepBearingNode =>
  isRecord(node) &&
  isRecord(node.data) &&
  isRecord(node.data.details) &&
  (!("steps" in node.data.details) || Array.isArray(node.data.details.steps))

const getNodeSteps = (node: unknown): readonly unknown[] =>
  isStepBearingNode(node) ? (node.data.details.steps ?? []) : []

const hasStepId = (step: unknown): step is { id: string } =>
  isRecord(step) && "id" in step && typeof step.id === "string"

const isSendWaTemplateStep = (
  step: unknown,
): step is SendWaTemplateMessageStepSchema =>
  typeof step === "object" &&
  step !== null &&
  "stepType" in step &&
  step.stepType === stepTypes.enum.sendWaTemplateMessage

function findStepInNodes<TStep>(
  nodes: readonly unknown[],
  predicate: (step: unknown) => step is TStep,
): TStep | null {
  for (const node of nodes) {
    const found = getNodeSteps(node).find(predicate)
    if (found) {
      return found
    }
  }

  return null
}

export const findSendWaTemplateStep = (
  nodes: readonly unknown[],
  stepId: string,
): SendWaTemplateMessageStepSchema | null =>
  findStepInNodes(
    nodes,
    (step): step is SendWaTemplateMessageStepSchema =>
      isSendWaTemplateStep(step) && hasStepId(step) && step.id === stepId,
  )

function extractCarouselParameterInfos(
  cards: TemplateComponentCard[],
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  for (const card of cards) {
    for (const comp of card.components) {
      if (comp.type === "HEADER") {
        if (comp.format === "IMAGE") {
          params.push({
            type: "carousel",
            index: 0,
            paramName: "image",
            format: "image",
            cardIndex: card.card_index,
          })
        } else if (comp.format === "VIDEO") {
          params.push({
            type: "carousel",
            index: 0,
            paramName: "video",
            format: "video",
            cardIndex: card.card_index,
          })
        }
      } else if (comp.type === "BODY" && comp.text) {
        const matches = comp.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          for (const [idx, match] of matches.entries()) {
            const paramName = match.replace(/\{\{|\}\}/g, "")
            params.push({
              type: "carousel",
              index: idx,
              paramName,
              format: "text",
              cardIndex: card.card_index,
            })
          }
        }
      } else if (comp.type === "BUTTONS" && comp.buttons) {
        params.push(
          ...extractButtonParameterInfos(comp.buttons, card.card_index),
        )
      }
    }
  }

  return params
}

export function extractParameterInfos(
  components: TemplateComponent[],
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  if (!components || components.length === 0) {
    return params
  }

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          for (const [idx, match] of matches.entries()) {
            const paramName = match.replace(/\{\{|\}\}/g, "")
            params.push({
              type: "header",
              index: idx,
              paramName,
              format: "text",
            })
          }
        }
      } else if (component.format === "LOCATION") {
        params.push({
          type: "header",
          index: 0,
          paramName: "location",
          format: "location",
        })
      } else if (
        ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format || "")
      ) {
        params.push({
          type: "header",
          index: 0,
          paramName: "1",
          format: component.format?.toLowerCase(),
        })
      }
    } else if (component.type === "BODY" && component.text) {
      const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
      if (matches) {
        for (const [idx, match] of matches.entries()) {
          const paramName = match.replace(/\{\{|\}\}/g, "")
          params.push({
            type: "body",
            index: idx,
            paramName,
          })
        }
      }
    } else if (component.type === "BUTTONS" && component.buttons) {
      params.push(...extractButtonParameterInfos(component.buttons))
    } else if (component.type === "CAROUSEL" && component.cards) {
      params.push(...extractCarouselParameterInfos(component.cards))
    } else if (
      component.type === "LIMITED_TIME_OFFER" &&
      component.limited_time_offer?.has_expiration
    ) {
      params.push({
        type: "limited_time_offer",
        index: 0,
        paramName: "expiration_time_ms",
        format: "limited_time_offer",
      })
    }
  }

  return params
}
