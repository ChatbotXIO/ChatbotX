import {
  extractBearerToken,
  REALTIME_TOKEN_PURPOSE,
  type RealtimeAudienceKind,
  verifyRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import type * as Party from "partykit/server"

const PARTY_PATH_ROOM_INDEX = 2

const getRoomIdFromUrl = (url: string): string | undefined => {
  const segments = new URL(url).pathname.split("/").filter(Boolean)
  return segments[PARTY_PATH_ROOM_INDEX]
}

/** Verifies an inbound broadcast request from the builder. */
export const verifyBroadcastRequest = async (
  req: Party.Request,
  audienceKind: RealtimeAudienceKind,
  secret: string,
): Promise<Response | null> => {
  const token = extractBearerToken(req.headers.get("Authorization"))
  if (!token) {
    return new Response("Unauthorized", { status: 401 })
  }

  const roomId = getRoomIdFromUrl(req.url)
  if (!roomId) {
    return new Response("Bad Request", { status: 400 })
  }

  try {
    await verifyRealtimeToken(
      token,
      { kind: audienceKind, id: roomId },
      REALTIME_TOKEN_PURPOSE.broadcast,
      secret,
    )
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }
  return null
}
