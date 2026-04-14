import {
  appendCodeToMagicLink,
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
  contactInboxId?: string
}): FacebookButton {
  const { flowId, flowVersionId, button, metadata, contactInboxId } = props

  const buttonPayload = encodeButtonPayload({
    flowId,
    flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", metadata),
    sequenceStepId: extractMetadata("sequenceStepId", metadata),
    contactInboxId,
  })

  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
      return {
        type: "web_url",
        title: button.label,
        url: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
      }
    default: {
      return {
        type: "postback",
        title: button.label,
        payload: buttonPayload,
      }
    }
  }
}

export function convertFacebookButtons({
  flowId,
  flowVersionId,
  buttons,
  metadata,
  contactInboxId,
}: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({
        flowId,
        flowVersionId,
        button,
        metadata,
        contactInboxId,
      }),
    )
  }
}
