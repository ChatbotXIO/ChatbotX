import {
  type AgentMarkAsReadProps,
  SdkException,
  type SendTypingProps,
} from "@aha.chat/sdk"
import { sendChatAction } from "./apis/bot"
import type { TelegramAuthValue } from "./schemas"

export const sendTyping = async (
  props: SendTypingProps<TelegramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  const chatId = conversation.sourceId
  if (!chatId) {
    throw new SdkException("Missing chat ID in conversation")
  }

  if (typing) {
    await sendChatAction(ctx.auth, {
      chat_id: chatId,
      action: "typing",
    })
  }
}

export const agentMarkAsRead = async (
  _props: AgentMarkAsReadProps<TelegramAuthValue>,
): Promise<void> => {
  // Telegram Bot API has no read receipt support
}
