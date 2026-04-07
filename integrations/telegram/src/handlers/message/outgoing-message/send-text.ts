import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
} from "../../../schema"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props

  if (step.buttons.length === 0) {
    yield { chat_id: contact.sourceId, text: step.text }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId: props.data.flowId,
    buttons: step.buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: contact.sourceId,
    text: step.text,
    reply_markup: keyboard,
  }
}
