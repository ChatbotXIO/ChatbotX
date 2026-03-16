import ky from "ky"
import { keys } from "./keys"
import { logger } from "./logger"
import type {
  RealtimeEventData,
  RealtimeEventNotifyExportResult,
} from "./schemas"

const env = keys()

export async function broadcastToChatbotParty(
  chatbotId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(
      `${env.NEXT_PUBLIC_PARTYSOCKET_URL}/parties/chatbots/${chatbotId}`,
      {
        headers: {
          "X-API-KEY": env.PARTYSOCKET_API_KEY,
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, `Failed to broadcast to chatbot ${chatbotId} party`)
    return null
  }
}

export async function broadcastToGuestParty(
  guestConversationId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(
      `${env.NEXT_PUBLIC_PARTYSOCKET_URL}/parties/guests/${guestConversationId}`,
      {
        headers: {
          "X-API-KEY": env.PARTYSOCKET_API_KEY,
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, "Failed to broadcast to guest party")
    return null
  }
}

export async function broadcastToUserParty(
  userId: string,
  json: RealtimeEventNotifyExportResult,
) {
  try {
    return await ky.post(
      `${env.NEXT_PUBLIC_PARTYSOCKET_URL}/parties/users/${userId}`,
      {
        headers: {
          "X-API-KEY": env.PARTYSOCKET_API_KEY,
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, `Failed to broadcast to user ${userId} party`)
    return null
  }
}
