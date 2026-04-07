import type { SendCarouselStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
  TelegramSendPhotoRequest,
} from "../../../schema"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepCarousel(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendCarouselStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendPhotoRequest | TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props

  const chatId = contact.sourceId
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
