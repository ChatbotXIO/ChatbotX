import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
} from "@chatbotx.io/flow-config"
import type { IntegrationJobMetadata } from "@chatbotx.io/sdk"

import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import type { FacebookButton } from "../../../schema"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: IntegrationJobMetadata
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
  metadata?: IntegrationJobMetadata
}): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({ flowId, flowVersionId, button, metadata }),
    )
  }
}
