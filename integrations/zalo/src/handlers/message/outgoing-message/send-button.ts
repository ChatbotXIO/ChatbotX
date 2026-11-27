import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
  ZALO_POSTBACK_TEXT_PREFIX,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import type { ButtonPayload } from "../../../schema/webhook"

const LEADING_PLUS = /^\+/

/**
 * Zalo's `oa.open.phone` takes the number as digits with the country code and
 * no `+` (docs example: `84919018791`), while flow buttons carry E.164.
 */
const toCallButton = (
  title: string,
  e164PhoneNumber: string,
): ButtonPayload => ({
  type: "oa.open.phone",
  title,
  payload: { phone_code: e164PhoneNumber.replace(LEADING_PLUS, "") },
})

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
  contactInboxId?: string
}): ButtonPayload {
  const { button, metadata, contactInboxId } = props

  const buttonPayload = encodeButtonPayload({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", metadata),
    sequenceStepId: extractMetadata("sequenceStepId", metadata),
    contactInboxId,
  })

  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
      return {
        type: "oa.open.url",
        title: button.label,
        payload: {
          url: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
        },
      }
    case buttonTypes.enum.callPhoneNumber:
      return toCallButton(button.label, button.beforeStep.phoneNumber)
    default:
      return {
        type: "oa.query.hide",
        title: button.label,
        payload: `${ZALO_POSTBACK_TEXT_PREFIX}${buttonPayload}`,
      }
  }
}

export function convertZaloButtons(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): ButtonPayload[] | undefined {
  const chunks = chunk(props.buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        button,
        metadata: props.metadata,
        contactInboxId: props.contactInboxId,
      }),
    )
  }
}

export function getCanonicalButtonTemplate(
  button: MessageButtonTemplate,
): ButtonPayload {
  if (button.buttonType === "url") {
    return {
      type: "oa.open.url",
      title: button.label,
      payload: { url: button.url },
    }
  }

  if (button.buttonType === "phoneNumber") {
    return toCallButton(button.label, button.phoneNumber)
  }

  return {
    type: "oa.query.hide",
    title: button.label,
    payload: `${ZALO_POSTBACK_TEXT_PREFIX}${button.postback}`,
  }
}
