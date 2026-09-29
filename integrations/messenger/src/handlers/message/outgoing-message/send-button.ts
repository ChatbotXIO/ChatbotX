import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { logDiagnostic } from "@chatbotx.io/logger"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import { logger } from "../../../lib/logger"
import type { FacebookButton } from "../../../schema"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
  contactInboxId?: string
}): FacebookButton {
  const { flowId, flowVersionId, button, metadata, contactInboxId } = props

  // This is the payload the contact actually taps — `convertButtonsToTemplate`
  // in the worker encodes its own copy for the `Message` row only, so the two
  // must stay in step. Attribution that reaches only one of them is invisible
  // to either the click or the inbox.
  const commentAutomationId = extractMetadata("commentAutomationId", metadata)
  const buttonPayload = encodeButtonPayload({
    flowId,
    flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", metadata),
    sequenceStepId: extractMetadata("sequenceStepId", metadata),
    contactInboxId,
    commentAutomationId,
  })

  // The payload the contact will actually tap. Logged next to the worker's
  // mirror copy (`convertButtonsToTemplate`) so a build of this package that
  // predates the attribution field is visible as a difference between the two,
  // rather than as a click that quietly counts nothing.
  logDiagnostic(
    logger,
    () => ({
      flowId,
      buttonId: button.id,
      buttonType: button.buttonType,
      contactInboxId: contactInboxId ?? null,
      commentAutomationId: commentAutomationId ?? null,
      hasMetadata: Boolean(metadata),
      payload: buttonPayload,
    }),
    "messenger getButtonTemplate: encoded button payload (tapped copy)",
  )

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

export function convertButtons({
  flowId,
  flowVersionId,
  buttons,
  metadata,
  contactInboxId,
  transformLabel,
}: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
  /**
   * Optionally rewrites each button's label before templating (used by the
   * Messenger Ads JSON converter to apply Facebook's variable substitutions).
   */
  transformLabel?: (label: string) => string
}): FacebookButton[] | undefined {
  const chunks = chunk(buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({
        flowId,
        flowVersionId,
        button: transformLabel
          ? { ...button, label: transformLabel(button.label) }
          : button,
        metadata,
        contactInboxId,
      }),
    )
  }
}
