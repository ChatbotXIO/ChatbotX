import { type ButtonStepProps, ButtonType } from "@aha.chat/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../constants"
import type { ButtonPayload } from "../schemas/webhook"

export function getButtonTemplate(
  flowVersionId: string,
  button: ButtonStepProps,
): ButtonPayload {
  switch (button.buttonType) {
    case ButtonType.OpenWebsite:
      return {
        type: "oa.open.url",
        title: button.label,
        payload: {
          url: button.beforeStep.url,
        },
      }
    default:
      return {
        type: "oa.query.hide",
        title: button.label,
        payload: `postback_${flowVersionId}_${button.id}`,
      }
  }
}

export function convertZaloButtons(
  flowVersionId: string,
  buttons: ButtonStepProps[],
): ButtonPayload[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) => getButtonTemplate(flowVersionId, button))
  }
}
