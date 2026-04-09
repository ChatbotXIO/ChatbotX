import ky from "ky"
import { keys } from "./keys"
import { logger } from "./logger"
import type { RealtimeEvent } from "./schema"

const env = keys()

export async function broadcastToWorkspaceParty(
  workspaceId: string,
  json: RealtimeEvent,
) {
  try {
    return await ky.post(
      `${env.NEXT_PUBLIC_PARTYSOCKET_URL}/parties/workspaces/${workspaceId}`,
      {
        headers: {
          "X-API-KEY": env.PARTYSOCKET_API_KEY,
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, `Failed to broadcast to workspace ${workspaceId} party`)
    return null
  }
}

export async function broadcastToGuestParty(
  guestConversationId: string,
  json: RealtimeEvent,
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
