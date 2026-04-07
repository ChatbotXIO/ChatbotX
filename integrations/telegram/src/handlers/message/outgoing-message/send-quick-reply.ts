import type { SendQuickReplyStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
} from "../../../schema"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepQuickReply(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendQuickReplyStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId: props.data.flowId,
    buttons: step.buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    text: step.message,
    reply_markup: keyboard,
  }
}
