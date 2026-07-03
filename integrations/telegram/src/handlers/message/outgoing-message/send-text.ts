import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
} from "../../../schema"
import {
  buildCanonicalInlineButton,
  buildInlineButton,
  buildInlineKeyboardFromButtons,
} from "./send-button"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props
  const buttons = [
    ...step.buttons.map((button) =>
      buildInlineButton({ flowId: props.data.flowId, button }),
    ),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  if (buttons.length === 0) {
    yield { chat_id: contact.sourceId, text: step.text }
    return
  }

  const keyboard = buildInlineKeyboardFromButtons(
    buttons,
    MAX_INLINE_BUTTONS_PER_ROW,
  )

  yield {
    chat_id: contact.sourceId,
    text: step.text,
    reply_markup: keyboard,
  }
}
