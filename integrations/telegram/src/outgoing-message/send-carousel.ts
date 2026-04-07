import type { SendCarouselStepSchema } from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
  TelegramSendPhotoRequest,
} from "../schemas"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepCarousel(
  props: SendFlowStepProps<TelegramAuthValue, SendCarouselStepSchema>,
): Generator<TelegramSendPhotoRequest | TelegramSendMessageRequest> {
  const {
    data: { step, conversation },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  for (const card of step.cards) {
    const text = [
      "title" in card ? card.title : undefined,
      "subtitle" in card ? card.subtitle : undefined,
    ]
      .filter(Boolean)
      .join("\n")

    const imageUrl = "image" in card ? card.image?.url : undefined

    const hasButtons = "buttons" in card && card.buttons.length > 0
    const replyMarkup = hasButtons
      ? buildInlineKeyboard({
          flowId: props.data.flowId,
          buttons: card.buttons,
        })
      : undefined

    if (imageUrl) {
      yield {
        chat_id: chatId,
        photo: imageUrl,
        caption: text || undefined,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }
    } else if (text) {
      yield {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }
    }
  }
}
