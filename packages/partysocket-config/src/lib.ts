import ky, { HTTPError } from "ky"
import {
  REALTIME_TOKEN_PURPOSE,
  REALTIME_TOKEN_TTL_SECONDS,
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

const AUTH_HEADER_REUSE_MS = (REALTIME_TOKEN_TTL_SECONDS - 15) * 1000
const MAX_CACHED_AUTH_HEADERS = 10_000

type CachedAuthHeader = {
  expiresAt: number
  header: Promise<string>
  secret: string
}

const authHeaders = new Map<string, CachedAuthHeader>()

export const buildBroadcastAuthHeader = (
  audience: RealtimeAudience,
  secret: string,
): Promise<string> => {
  const key = `${audience.kind}:${audience.id}`
  const now = Date.now()
  const cached = authHeaders.get(key)
  if (cached?.secret === secret && cached.expiresAt > now) {
    return cached.header
  }

  authHeaders.delete(key)
  if (authHeaders.size >= MAX_CACHED_AUTH_HEADERS) {
    for (const [cachedKey, entry] of authHeaders) {
      if (entry.expiresAt <= now) {
        authHeaders.delete(cachedKey)
      }
    }
  }
  if (authHeaders.size >= MAX_CACHED_AUTH_HEADERS) {
    const oldestKey = authHeaders.keys().next().value
    if (oldestKey) {
      authHeaders.delete(oldestKey)
    }
  }

  const header = signRealtimeToken(
    audience,
    REALTIME_TOKEN_PURPOSE.broadcast,
    secret,
  ).then((token) => `Bearer ${token}`)
  authHeaders.set(key, {
    expiresAt: now + AUTH_HEADER_REUSE_MS,
    header,
    secret,
  })
  header.catch(() => {
    if (authHeaders.get(key)?.header === header) {
      authHeaders.delete(key)
    }
  })
  return header
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
        Authorization: await buildBroadcastAuthHeader(
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
        Authorization: await buildBroadcastAuthHeader(
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
        Authorization: await buildBroadcastAuthHeader(
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
        Authorization: await buildBroadcastAuthHeader(
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
