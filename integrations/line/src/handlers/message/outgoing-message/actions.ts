import {
  type ButtonStepProps,
  type ButtonStyle,
  buttonTypes,
  encodeButtonPayload,
  normalizeDialablePhoneNumber,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { LINE_LIMITS, truncate } from "./limits"

/**
 * A LINE action object. Flex buttons and quick reply items carry the same
 * shape; a flex button is made only through `flexBubbles` (see `flex.ts`).
 */
export type LineAction =
  | { type: "uri"; label: string; uri: string }
  | { type: "postback"; label: string; data: string; displayText?: string }

export const uriAction = (label: string, uri: string): LineAction => ({
  type: "uri",
  label: truncate(label, LINE_LIMITS.actionLabel),
  uri,
})

/** Postback that echoes the label as the user's bubble, like a Telegram callback. */
export const postbackAction = (label: string, data: string): LineAction => ({
  type: "postback",
  label: truncate(label, LINE_LIMITS.actionLabel),
  data,
  displayText: truncate(label, LINE_LIMITS.displayText),
})

export type FlowButtonInput = { flowId: string; button: ButtonStepProps }

/**
 * A flow button or a canonical (inbox/agent) button as a LINE action, or
 * `null` for a type LINE cannot render (the LINE policy rejects those at publish).
 */
export function toLineAction(
  input: FlowButtonInput | MessageButtonTemplate,
): LineAction | null {
  return "flowId" in input ? fromFlowButton(input) : fromTemplateButton(input)
}

const fromFlowButton = ({ flowId, button }: FlowButtonInput) => {
  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
      return uriAction(button.label, button.beforeStep.url)
    case buttonTypes.enum.callPhoneNumber: {
      const number = normalizeDialablePhoneNumber(button.beforeStep.phoneNumber)
      return number ? uriAction(button.label, `tel:${number}`) : null
    }
    // The worker rewrites openMiniApp to openWebsite before the send.
    case buttonTypes.enum.openMiniApp:
    case buttonTypes.enum.whatsappOptionList:
      return null
    default:
      return postbackAction(
        button.label,
        encodeButtonPayload({ flowId, buttonId: button.id }),
      )
  }
}

const fromTemplateButton = (button: MessageButtonTemplate): LineAction => {
  switch (button.buttonType) {
    case "url":
      return uriAction(button.label, button.url)
    case "phoneNumber":
      return uriAction(button.label, `tel:${button.phoneNumber}`)
    default:
      return postbackAction(button.label, button.postback)
  }
}

/** The renderable LINE actions for `inputs`, dropping types LINE cannot render. */
export const toLineActions = (
  inputs: Array<FlowButtonInput | MessageButtonTemplate>,
): LineAction[] =>
  inputs
    .map(toLineAction)
    .filter((action): action is LineAction => action !== null)

/**
 * A flex footer button before rendering: its action and the style its author
 * chose, if any. `flexBubbles` is the one place an unset style becomes the
 * default.
 */
export type LineButton = { action: LineAction; style?: ButtonStyle }

/** Renderable buttons for a flow step's (or card's) buttons, each with its own style. */
export const flowButtons = (
  flowId: string,
  buttons: ButtonStepProps[],
): LineButton[] =>
  buttons.flatMap((button) => {
    const action = toLineAction({ flowId, button })
    if (!action) {
      return []
    }
    return [button.style ? { action, style: button.style } : { action }]
  })
