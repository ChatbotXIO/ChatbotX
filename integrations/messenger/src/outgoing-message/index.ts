import type { Context, ConversationEntity, MessageEntity } from "@aha.chat/sdk"
import type { FacebookGraphAPIError, MessengerAuthValue } from "../schemas"
import {
  type FacebookSendMessageRequest,
  type FacebookSendMessageResponse,
  facebookSendMessageRequestSchema,
  facebookSendMessageResponseSchema,
} from "../schemas"

const FACEBOOK_GRAPH_API_BASE_URL = "https://graph.facebook.com"

export const sendOutgoingMessage = async (
  ctx: Context<MessengerAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
): Promise<FacebookSendMessageResponse> => {
  try {
    const { tokens, metadata } = ctx.auth

    if (!tokens.pageAccessToken) {
      throw new Error("Missing Facebook page access token")
    }

    const messagePayload = buildMessagePayload(conversation, message)

    const validatedPayload =
      facebookSendMessageRequestSchema.parse(messagePayload)

    const response = await sendToFacebookAPI(
      validatedPayload,
      tokens.pageAccessToken,
      metadata.version,
    )

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
      message: { text: message.content },
      messaging_type: "RESPONSE",
    }
  }

  throw new Error("Unsupported message type or missing content")
}

const sendToFacebookAPI = async (
  payload: FacebookSendMessageRequest,
  accessToken: string,
  apiVersion: string,
): Promise<FacebookSendMessageResponse> => {
  try {
    const url = `${FACEBOOK_GRAPH_API_BASE_URL}/${apiVersion}/me/messages`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = (await response.json()) as FacebookGraphAPIError
      throw new Error(
        `Facebook API error: ${errorData.error.message} (Code: ${errorData.error.code})`,
      )
    }

    const data = (await response.json()) as unknown
    const validatedResponse = facebookSendMessageResponseSchema.parse(data)

    return validatedResponse
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown API error"

    throw new Error(`Facebook Graph API request failed: ${errorMessage}`)
  }
}
