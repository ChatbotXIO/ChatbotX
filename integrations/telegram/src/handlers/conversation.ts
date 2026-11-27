import { type ConversationHandlers, SdkException } from "@chatbotx.io/sdk"
import { sendChatAction } from "../apis/bot"
import { chatTarget } from "../lib/chat-target"
import type { TelegramAuthValue } from "../schema"

const sendTyping: ConversationHandlers<TelegramAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    const chatId = contact.sourceId
    if (!chatId) {
      throw new SdkException("Missing chat ID in conversation")
    }

    if (typing) {
      await sendChatAction(ctx.auth, {
        ...chatTarget(contact),
        action: "typing",
      })
    }
  }

export const conversationHandlers = {
  sendTyping,
}
