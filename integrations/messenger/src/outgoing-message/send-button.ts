import {
  type ButtonStepProps,
  ButtonType,
  encodeButtonPayload,
} from "@aha.chat/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../constants"
import type { FacebookButton } from "../schemas"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
}): FacebookButton {
  const { flowId, flowVersionId, button } = props

  switch (button.buttonType) {
    case ButtonType.OpenWebsite:
      return {
        type: "web_url",
        title: button.label,
        url: button.beforeStep.url,
      }
    default: {
      const buttonId = encodeButtonPayload({
        flowId,
        flowVersionId,
        buttonId: button.id,
      })
      return {
        type: "postback",
        title: button.label,
        payload: buttonId,
      }
    }
  }
}

export function convertFacebookButtons(
  flowId: string,
  flowVersionId: string,
  buttons: ButtonStepProps[],
): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({ flowId, flowVersionId, button }),
    )
  }
}
