import { type ButtonStepProps, ButtonType } from "@aha.chat/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../constants"
import type { FacebookButton } from "../schemas"

export function getButtonTemplate(
  flowVersionId: string,
  button: ButtonStepProps,
): FacebookButton {
  switch (button.buttonType) {
    case ButtonType.OpenWebsite:
      return {
        type: "web_url",
        title: button.label,
        url: button.beforeStep.url,
      }
    default:
      return {
        type: "postback",
        title: button.label,
        payload: `${flowVersionId}_${button.id}`,
      }
  }
}

export function convertFacebookButtons(
  flowVersionId: string,
  buttons: ButtonStepProps[],
): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) => getButtonTemplate(flowVersionId, button))
  }
}
