import {
  type ButtonStepProps,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
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

export const MAX_BUTTONS = 3
export const MAX_LIST_ROWS = 10
export const DEFAULT_LIST_BUTTON_LABEL = "Options"

const ROW_ID_MAX_LENGTH = 200

export function buildWhatsappButtonMessages(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  bodyText: string
  header?: Header
}) {
  const { buttons, flowId, flowVersionId, metadata } = props

  if (buttons.length === 0) {
    return []
  }

  if (buttons.length <= MAX_BUTTONS) {
    const actionButtons = buttons.map((button) => {
      const buttonId = encodeButtonPayload({
        flowId,
        flowVersionId,
        buttonId: button.id,
        broadcastId: extractMetadata("broadcastId", metadata),
        sequenceStepId: extractMetadata("sequenceStepId", metadata),
      })
      return new Button(buttonId, button.label)
    })

    return [
      new Interactive(
        new ActionButtons(...(actionButtons as [Button, ...Button[]])),
        new Body(props.bodyText),
        props.header,
      ),
    ]
  }

  if (buttons.length > MAX_LIST_ROWS) {
    throw new Error(
      `WhatsApp interactive lists support at most ${MAX_LIST_ROWS} quick reply rows`,
    )
  }

  const rows = buttons.map((button) => {
    const buttonId = encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId: extractMetadata("broadcastId", metadata),
      sequenceStepId: extractMetadata("sequenceStepId", metadata),
    })
    return new Row(
      buttonId.slice(0, ROW_ID_MAX_LENGTH),
      button.label.slice(0, 24),
    )
  })
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
