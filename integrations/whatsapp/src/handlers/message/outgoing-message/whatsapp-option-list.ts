import {
  encodeButtonPayload,
  extractMetadata,
  WHATSAPP_OPTION_LIST_BUTTON_MAX,
  WHATSAPP_OPTION_LIST_DESCRIPTION_MAX,
  WHATSAPP_OPTION_LIST_TITLE_MAX,
  type WhatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import {
  ActionList,
  Interactive,
  ListSection,
  Row,
} from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { generateBody } from "../interactive"

const ROW_ID_MAX_LENGTH = 200

export function* convertFlowStepWhatsappOptionList(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      WhatsappOptionListStepSchema
    >["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props

  const button = step.buttonLabel
    .trim()
    .slice(0, WHATSAPP_OPTION_LIST_BUTTON_MAX)

  const rows: Row[] = []
  for (const btn of step.buttons) {
    const encoded = encodeButtonPayload({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttonId: btn.id,
      broadcastId: extractMetadata("broadcastId", props.data.metadata),
      sequenceStepId: extractMetadata("sequenceStepId", props.data.metadata),
    })
    if (encoded.length > ROW_ID_MAX_LENGTH) {
      continue
    }
    rows.push(
      new Row(
        encoded,
        btn.label.slice(0, WHATSAPP_OPTION_LIST_TITLE_MAX),
        btn.description?.slice(0, WHATSAPP_OPTION_LIST_DESCRIPTION_MAX),
      ),
    )
  }

  if (rows.length === 0) {
    return
  }

  const [firstRow, ...restRows] = rows
  const section = new ListSection(undefined, firstRow, ...restRows)

  yield new Interactive(
    new ActionList(button, section),
    generateBody(step.text),
  )
}
