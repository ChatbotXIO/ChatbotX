import type { Context, ConversationEntity, MessageEntity } from "@aha.chat/sdk"
import { sendMessage } from "../apis/page"
import {
  type FacebookSendMessageRequest,
  type FacebookSendMessageResponse,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../schemas"

export const sendOutgoingMessage = async (
  ctx: Context<MessengerAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
): Promise<FacebookSendMessageResponse> => {
  try {
    const payload = buildMessagePayload(conversation, message)

    const response = await sendMessage(ctx.auth, payload)

    return response
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error sending message"

    throw new Error(`Failed to send Facebook message: ${errorMessage}`)
  }
}

const buildMessagePayload = (
  conversation: ConversationEntity,
  message: MessageEntity,
): FacebookSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  if (message.content) {
    return {
      recipient: { id: recipientId },
      message: {
        text: message.content,
        metadata: MESSENGER_MESSAGE_METADATA,
      },
      messaging_type: "MESSAGE_TAG",
      tag: "ACCOUNT_UPDATE",
    }
  }

  throw new Error("Unsupported message type or missing content")
}
