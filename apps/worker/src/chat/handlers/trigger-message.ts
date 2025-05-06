import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@ahachat.ai/database"
import {
  ChatJobAction,
  type ChatJobTriggerMessage,
} from "@ahachat.ai/worker-config"
import { sendMessage } from "./send-message"
import type { ConversationEntity, MessageEntity } from "@ahachat.ai/sdk"

export async function triggerMessage(props: ChatJobTriggerMessage) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: props.data.conversationId },
    include: { contact: true },
  })
  if (!conversation) return

  const message = await prisma.message.create({
    data: {
      inboxId: conversation.inboxId,
      chatbotId: conversation.chatbotId,
      conversationId: conversation.id,
      messageType: MessageType.INCOMING,
      contentType: ContentType.TEXT,
      senderType: SenderType.BOT,
      sourceId: null,
      content: props.data.content,
    },
  })

  await sendMessage({
    type: ChatJobAction.SEND_MESSAGE,
    data: {
      conversation: conversation as ConversationEntity,
      message: message as MessageEntity,
    },
  })
}
