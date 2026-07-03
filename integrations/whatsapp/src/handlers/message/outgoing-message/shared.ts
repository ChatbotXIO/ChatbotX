import {
  type ButtonStepProps,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import {
  ActionButtons,
  ActionList,
  Body,
  Button,
  type Header,
  Interactive,
  ListSection,
  Row,
} from "whatsapp-api-js/messages"
import { logger } from "../../../lib/logger"

export const MAX_BUTTONS = 3
export const MAX_LIST_ROWS = 10
export const DEFAULT_LIST_BUTTON_LABEL = "Options"

const ROW_ID_MAX_LENGTH = 200

type WhatsappReplyButton = {
  id: string
  label: string
}

function normalizeRawButton(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
}): WhatsappReplyButton {
  const { flowId, flowVersionId, button, metadata } = props

  return {
    id: encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId: extractMetadata("broadcastId", metadata),
      sequenceStepId: extractMetadata("sequenceStepId", metadata),
    }),
    label: button.label,
  }
}

function normalizeCanonicalQuickReply(
  button: MessageButtonTemplate,
): WhatsappReplyButton {
  return {
    id: getCanonicalReplyPayload(button),
    label: button.label,
  }
}

export function buildWhatsappButtonMessages(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  quickReplies?: MessageButtonTemplate[]
  metadata?: MetadataPayload
  bodyText: string
  header?: Header
}) {
  const buttons = [
    ...props.buttons.map((button) =>
      normalizeRawButton({
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        button,
        metadata: props.metadata,
      }),
    ),
    ...(props.quickReplies ?? []).map(normalizeCanonicalQuickReply),
  ]

  if (buttons.length === 0) {
    return []
  }

  if (buttons.length <= MAX_BUTTONS) {
    const actionButtons = buttons.map(
      (button) => new Button(button.id, button.label),
    )

    return [
      new Interactive(
        new ActionButtons(...(actionButtons as [Button, ...Button[]])),
        new Body(props.bodyText),
        props.header,
      ),
    ]
  }

  const listButtons = buttons.slice(0, MAX_LIST_ROWS)
  if (listButtons.length < buttons.length) {
    logger.warn(
      { total: buttons.length, kept: MAX_LIST_ROWS },
      `WhatsApp interactive lists support at most ${MAX_LIST_ROWS} quick reply rows; truncating extra buttons`,
    )
  }

  const rows = listButtons.map(
    (button) =>
      new Row(button.id.slice(0, ROW_ID_MAX_LENGTH), button.label.slice(0, 24)),
  )
  const [firstRow, ...restRows] = rows

  return [
    new Interactive(
      new ActionList(
        DEFAULT_LIST_BUTTON_LABEL,
        new ListSection(undefined, firstRow, ...restRows),
      ),
      new Body(props.bodyText),
    ),
  ]
}
