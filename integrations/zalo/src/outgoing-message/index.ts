import type { Context, ConversationEntity, MessageEntity } from "@aha.chat/sdk"
import { sendMessage } from "../api/message"
import type { ZaloAuthValue } from "../schemas/definition"
import {
  ZALO_MESSAGE_METADATA,
  type ZaloSendMessageRequest,
  type ZaloSendMessageResponse,
} from "../schemas/webhook"

export const sendOutgoingMessage = async (
  ctx: Context<ZaloAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
): Promise<ZaloSendMessageResponse> => {
  try {
    const payload = buildMessagePayload(conversation, message)

    const response = await sendMessage(ctx.auth, payload)

    return response
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error sending message"

    throw new Error(`Failed to send Zalo message: ${errorMessage}`)
  }
}

const buildMessagePayload = (
  conversation: ConversationEntity,
  message: MessageEntity,
): ZaloSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  if (message.content) {
    return {
      recipient: { user_id: recipientId },
      message: {
        text: message.content,
        metadata: ZALO_MESSAGE_METADATA,
      },
    }
  }

  throw new Error("Unsupported message type or missing content")
}
