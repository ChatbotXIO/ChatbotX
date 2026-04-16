import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import type { FacebookButton } from "../../../schema"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
}): FacebookButton {
  const { flowId, flowVersionId, button, metadata } = props

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
        broadcastId: extractMetadata("broadcastId", metadata),
        sequenceStepId: extractMetadata("sequenceStepId", metadata),
      })
      return {
        type: "postback",
        title: button.label,
        payload: buttonId,
      }
    }
  }
}

export function convertFacebookButtons({
  flowId,
  flowVersionId,
  buttons,
  metadata,
}: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
}): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({ flowId, flowVersionId, button, metadata }),
    )
  }
}
