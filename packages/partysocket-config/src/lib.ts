import ky, { HTTPError } from "ky"
import {
  REALTIME_TOKEN_PURPOSE,
  type RealtimeAudience,
  signRealtimeToken,
} from "./auth"
import { logger } from "./logger"
import type { RealtimeEventData } from "./schemas"

export interface BroadcastTarget {
  secret: string
  url: string
}

/**
 * Extracts only safe fields for logging — a raw ky HTTPError retains the
 * request body (VoIP offer/answer SDP) and bearer token header, so logging it
 * directly would leak both. `stack` is kept since it's the field that says
 * which call site failed.
 */
const describeBroadcastError = (error: unknown): Record<string, unknown> => {
  if (error instanceof HTTPError) {
    return {
      name: error.name,
      status: error.response.status,
      message: error.message,
      stack: error.stack,
    }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: "unknown broadcast error" }
}

const buildAuthHeader = async (
  audience: RealtimeAudience,
  secret: string,
): Promise<string> => {
  const token = await signRealtimeToken(
    audience,
    REALTIME_TOKEN_PURPOSE.broadcast,
    secret,
  )
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
    logger.error(
      describeBroadcastError(error),
      `Failed to broadcast to workspace ${workspaceId} party`,
    )
    return null
  }
}

/**
 * Delivers an event to only one workspace member's tagged connections, instead
 * of the workspace-wide broadcast above. The party still authenticates the same
 * way; targeting is carried out-of-band as a query param so the JSON body never
 * changes shape.
 */
export async function sendToWorkspaceMember(
  target: BroadcastTarget,
  workspaceId: string,
  targetUserId: string,
  json: RealtimeEventData,
) {
  try {
    return await ky.post(`parties/workspaces/${workspaceId}`, {
      baseUrl: target.url,
      searchParams: { userId: targetUserId },
      headers: {
        Authorization: await buildAuthHeader(
          { kind: "workspace", id: workspaceId },
          target.secret,
        ),
      },
      json,
    })
  } catch (error) {
    logger.error(
      describeBroadcastError(error),
      `Failed to send to workspace ${workspaceId} member ${targetUserId}`,
    )
    return null
  }
}

/**
 * Closes every currently-open tagged connection a member holds in a workspace
 * room — used on membership removal so a revoked member can't keep receiving
 * events over a socket opened before removal.
 */
export async function revokeWorkspaceMemberConnections(
  target: BroadcastTarget,
  workspaceId: string,
  targetUserId: string,
) {
  try {
    return await ky.post(`parties/workspaces/${workspaceId}`, {
      baseUrl: target.url,
      searchParams: { action: "revoke", userId: targetUserId },
      headers: {
        Authorization: await buildAuthHeader(
          { kind: "workspace", id: workspaceId },
          target.secret,
        ),
      },
    })
  } catch (error) {
    logger.error(
      describeBroadcastError(error),
      `Failed to revoke workspace ${workspaceId} member ${targetUserId} connections`,
    )
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
    logger.error(
      describeBroadcastError(error),
      "Failed to broadcast to guest party",
    )
    throw error
  }
}
