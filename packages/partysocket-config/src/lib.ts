import ky from "ky"
import { type RealtimeAudience, signRealtimeToken } from "./auth"
import { env } from "./keys"
import { logger } from "./logger"
import type {
  RealtimeEventData,
  RealtimeEventNotifyExportResult,
} from "./schemas"

const buildAuthHeader = async (audience: RealtimeAudience): Promise<string> => {
  const token = await signRealtimeToken(audience, env.REALTIME_BROADCAST_SECRET)
  return `Bearer ${token}`
}

export async function broadcastToWorkspaceParty(
  workspaceId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(
      `${env.REALTIME_BROADCAST_URL}/parties/workspaces/${workspaceId}`,
      {
        headers: {
          Authorization: await buildAuthHeader({
            kind: "workspace",
            id: workspaceId,
          }),
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
  json: RealtimeEventData,
) {
  try {
    return await ky.post(
      `${env.REALTIME_BROADCAST_URL}/parties/guests/${guestConversationId}`,
      {
        headers: {
          Authorization: await buildAuthHeader({
            kind: "guest",
            id: guestConversationId,
          }),
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, "Failed to broadcast to guest party")
    throw error
  }
}

export async function broadcastToUserParty(
  userId: string,
  json: RealtimeEventNotifyExportResult,
) {
  try {
    return await ky.post(
      `${env.REALTIME_BROADCAST_URL}/parties/users/${userId}`,
      {
        headers: {
          Authorization: await buildAuthHeader({
            kind: "user",
            id: userId,
          }),
        },
        json,
      },
    )
  } catch (error) {
    logger.error(error, `Failed to broadcast to user ${userId} party`)
    return null
  }
}
