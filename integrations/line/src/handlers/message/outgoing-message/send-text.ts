import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import { flowButtons } from "./actions"
import type { LineMessage } from "./dispatch"
import { buttonLabels, flexBubbles, flexMessages } from "./flex"
import { LINE_LIMITS, safeCutIndex } from "./limits"

/** Text messages for `text`, split at LINE's 5000 UTF-16 units (never inside a surrogate pair). */
export const textMessages = (text: string): LineMessage[] => {
  const messages: LineMessage[] = []
  let rest = text
  while (rest.length > 0) {
    const cut =
      rest.length <= LINE_LIMITS.textMessage
        ? rest.length
        : safeCutIndex(rest, LINE_LIMITS.textMessage)
    messages.push({ type: "text", text: rest.slice(0, cut) })
    rest = rest.slice(cut)
  }
  return messages
}

/**
 * Without buttons → text message(s). With buttons → one flex bubble holding
 * the full text, then the buttons.
 */
export const convertFlowStepText = (
  step: Pick<SendTextStepSchema, "text" | "buttons">,
  flowId: string,
): LineMessage[] => {
  const buttons = flowButtons(flowId, step.buttons)
  if (buttons.length === 0) {
    return textMessages(step.text)
  }
  return flexMessages(
    flexBubbles({
      text: step.text,
      buttons,
      maxButtons: LINE_LIMITS.stepButtons,
    }),
    step.text || buttonLabels(buttons, LINE_LIMITS.stepButtons),
  )
}
