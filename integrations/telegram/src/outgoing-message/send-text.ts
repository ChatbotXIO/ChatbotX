import type { SendTextStepSchema } from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../constants"
import type { TelegramAuthValue, TelegramSendMessageRequest } from "../schemas"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<TelegramAuthValue, SendTextStepSchema>,
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, conversation },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  if (step.buttons.length === 0) {
    yield { chat_id: chatId, text: step.message }
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
