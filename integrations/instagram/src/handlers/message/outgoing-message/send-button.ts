import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import type { InstagramButton } from "../../../schemas"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
}): InstagramButton {
  const { flowId, flowVersionId, button } = props

  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
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

export function convertInstagramButtons({
  flowId,
  flowVersionId,
  buttons,
}: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
}): InstagramButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({ flowId, flowVersionId, button }),
    )
  }
}
