import type { ButtonStepProps } from "./button"
import {
  BUTTON_LABEL_MAX,
  buttonStepDefaultFn,
  mergeTemplateButtonsWithExisting,
} from "./button"
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
  /**
   * Dense position of this button param among the parameterized buttons of its
   * component. `extractButtonParams` stores param entries densely (only
   * parameterized buttons get an entry), so form fields must write at this
   * position — writing at `buttonIndex` creates duplicate entries whenever a
   * non-parameterized button (static URL, phone number) precedes this one.
   */
  paramIndex?: number
}

function extractButtonParameterInfos(
  buttons: TemplateComponentButton[],
  cardIndex?: number,
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  for (const [buttonIdx, button] of buttons.entries()) {
    const buttonType = button.type.toUpperCase()
    const paramIndex = params.length

    if (buttonType === "URL" && button.url?.includes("{{1}}")) {
      params.push({
        type: "button",
        index: 0,
        paramName: "1",
        buttonIndex: buttonIdx,
        buttonSubType: "url",
        cardIndex,
        paramIndex,
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
        paramIndex,
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
        paramIndex,
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
        paramIndex,
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
        paramIndex,
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

const QUICK_REPLY_BUTTON_TYPE = "QUICK_REPLY"

/**
 * The first step buttons of a `sendWaTemplateMessage` step are the delivery
 * status branches (`Delivered`/`Failed`) that the message-status handler routes
 * by label. They must always stay in front; template quick-reply buttons are
 * appended after them.
 */
export const WA_TEMPLATE_STATUS_BUTTON_COUNT = 2

export type TemplateQuickReplyButton = {
  /** Zero-based position of the button within the template's button list. */
  templateButtonIndex: number
  text: string
}

export function extractTemplateQuickReplyButtons(
  components: TemplateComponent[],
): TemplateQuickReplyButton[] {
  const buttonsComponent = components?.find(
    (component) => component.type === "BUTTONS" && component.buttons,
  )

  return (buttonsComponent?.buttons ?? []).flatMap((button, index) =>
    button.type.toUpperCase() === QUICK_REPLY_BUTTON_TYPE
      ? [{ templateButtonIndex: index, text: button.text }]
      : [],
  )
}

export type WaTemplateStepButtonsSplit<TButton> = {
  statusButtons: TButton[]
  quickReplyButtons: TButton[]
}

/**
 * Single owner of the "first N buttons are status branches, the rest are
 * template quick replies" rule, so editor, viewer, seeding, and binding can
 * never disagree on where the split sits.
 */
export function splitWaTemplateStepButtons<TButton>(
  buttons: readonly TButton[],
): WaTemplateStepButtonsSplit<TButton> {
  return {
    statusButtons: buttons.slice(0, WA_TEMPLATE_STATUS_BUTTON_COUNT),
    quickReplyButtons: buttons.slice(WA_TEMPLATE_STATUS_BUTTON_COUNT),
  }
}

/**
 * Rebuilds a `sendWaTemplateMessage` step's buttons for a newly selected
 * template: the leading status branches are preserved (with their edges), and
 * the tail follows the template's quick-reply buttons. Existing tail buttons
 * keep their id and configured action across template edits — only the label
 * follows the template — and unchanged buttons keep their object identity so
 * callers can detect a no-op reseed by reference.
 */
export function seedWaTemplateStepButtons(
  existingButtons: ButtonStepProps[],
  components: TemplateComponent[],
): ButtonStepProps[] {
  const { statusButtons, quickReplyButtons: previousQuickReplies } =
    splitWaTemplateStepButtons(existingButtons)

  const templateButtons = extractTemplateQuickReplyButtons(components).map(
    (quickReply) =>
      buttonStepDefaultFn({
        label: quickReply.text.slice(0, BUTTON_LABEL_MAX),
      }),
  )

  return [
    ...statusButtons,
    ...mergeTemplateButtonsWithExisting(templateButtons, previousQuickReplies),
  ]
}

export type WaTemplateStepButtonRef = Pick<ButtonStepProps, "id" | "label">

export type WaTemplateQuickReplyBinding = {
  templateButtonIndex: number
  stepButton: WaTemplateStepButtonRef
}

/**
 * Pairs the template's quick-reply buttons with the step buttons that
 * `seedWaTemplateStepButtons` appended after the status branches, by position.
 * Steps saved before quick-reply seeding existed have no tail and yield no
 * bindings, so their sends stay component-free (Meta's default applies).
 */
export function bindWaTemplateQuickReplyButtons(
  components: TemplateComponent[],
  stepButtons: readonly WaTemplateStepButtonRef[],
): WaTemplateQuickReplyBinding[] {
  const { quickReplyButtons } = splitWaTemplateStepButtons(stepButtons)
  // Broadcasts and legacy status-only steps have no tail — skip the template
  // component scan entirely on this high-volume send path.
  if (quickReplyButtons.length === 0) {
    return []
  }

  return extractTemplateQuickReplyButtons(components).flatMap(
    (quickReply, position) => {
      const stepButton = quickReplyButtons[position]
      return stepButton
        ? [{ templateButtonIndex: quickReply.templateButtonIndex, stepButton }]
        : []
    },
  )
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
