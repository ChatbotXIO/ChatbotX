import type { AgentMarkAsReadProps, SendTypingProps } from "@aha.chat/sdk"
import { getWhatsappClient } from "./client"
import type { WhatsappAuthValue } from "./schemas"

export const sendTyping = async (props: SendTypingProps<WhatsappAuthValue>) => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  if (!typing) {
    return // does not support typing off
  }

  const whatsappClient = getWhatsappClient(ctx.auth)

  await whatsappClient.markAsRead(
    (conversation.conversationAttributes as { phoneNumberId: string })
      .phoneNumberId,
    "lastMessageId", // TODO: get last message id
    "text",
  )
}

export const agentMarkAsRead = async (
  props: AgentMarkAsReadProps<WhatsappAuthValue>,
) => {
  const {
    ctx,
    data: { conversation },
  } = props

  const whatsappClient = getWhatsappClient(ctx.auth)

  await whatsappClient.markAsRead(
    (conversation.conversationAttributes as { phoneNumberId: string })
      .phoneNumberId,
    "lastMessageId", // TODO: get last message id
  )
}
