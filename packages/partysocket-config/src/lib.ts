import ky from "ky"
import { type RealtimeAudience, signRealtimeToken } from "./auth"
import { logger } from "./logger"
import type { RealtimeEventData } from "./schemas"

export interface BroadcastTarget {
  secret: string
  url: string
}

const buildAuthHeader = async (
  audience: RealtimeAudience,
  secret: string,
): Promise<string> => {
  const token = await signRealtimeToken(audience, secret)
  return `Bearer ${token}`
}

export async function broadcastToWorkspaceParty(
  target: BroadcastTarget,
  workspaceId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(`parties/workspaces/${workspaceId}`, {
      baseUrl: target.url,
      headers: {
        Authorization: await buildAuthHeader(
          { kind: "workspace", id: workspaceId },
          target.secret,
        ),
      },
      json,
    })
  } catch (error) {
    logger.error(error, `Failed to broadcast to workspace ${workspaceId} party`)
    return null
  }
}

export async function broadcastToGuestParty(
  target: BroadcastTarget,
  guestConversationId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(`parties/guests/${guestConversationId}`, {
      baseUrl: target.url,
      headers: {
        Authorization: await buildAuthHeader(
          { kind: "guest", id: guestConversationId },
          target.secret,
        ),
      },
      json,
    })
  } catch (error) {
    logger.error(error, "Failed to broadcast to guest party")
    throw error
  }
}
