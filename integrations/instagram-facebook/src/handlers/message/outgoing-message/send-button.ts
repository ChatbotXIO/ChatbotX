import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import { logger } from "../../../lib/logger"
import type { InstagramButton } from "../../../schema"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
}): InstagramButton {
  const { flowId, flowVersionId, button, metadata } = props

  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
      return {
        type: "web_url",
        title: button.label,
        url: button.beforeStep.url,
      }
    default: {
      // This is the payload the contact actually taps. The worker's
      // `convertButtonsToTemplate` encodes its own copy for the `Message` row
      // only, so attribution has to be read here too or the click carries none.
      const buttonId = encodeButtonPayload({
        flowId,
        flowVersionId,
        buttonId: button.id,
        commentAutomationId: extractMetadata("commentAutomationId", metadata),
      })
      return {
        type: "postback",
        title: button.label,
        payload: buttonId,
      }
    }
  }
}

export function convertButtons({
  flowId,
  flowVersionId,
  buttons,
  metadata,
}: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
}): InstagramButton[] | undefined {
  // Instagram's button template takes MAX_BUTTONS; the rest are not sent. A
  // node authored for a channel with a higher limit (LINE: 5) can reach an
  // Instagram contact via a jump or broadcast, so make the loss visible.
  if (buttons.length > MAX_BUTTONS) {
    logger.warn(
      {
        flowId,
        flowVersionId,
        kept: MAX_BUTTONS,
        dropped: buttons.length - MAX_BUTTONS,
      },
      "Dropping step buttons over the channel's button limit",
    )
  }
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({ flowId, flowVersionId, button, metadata }),
    )
  }
}
