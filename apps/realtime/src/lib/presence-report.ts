import {
  REALTIME_TOKEN_PURPOSE,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import {
  hashPresenceUserIds,
  truncatePresenceUserIds,
} from "@chatbotx.io/partysocket-config/presence"
import ky from "ky"
import { env } from "../env"
import { logger } from "../logger"

/**
 * Periodic mirror of connected user ids into Redis, authenticated with the
 * same shared secret/JWT scheme (signRealtimeToken) used in reverse for
 * inbound broadcast requests. Best-effort: failures are logged and
 * swallowed, never thrown or retried — the next interval supersedes a lost
 * report.
 */
export async function reportWorkspacePresence(
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  try {
    // Bounded here, before hashing/sending, not left for the route to reject —
    // a room bigger than the cap must never turn the whole workspace offline by
    // having its report 400 outright.
    const boundedUserIds = truncatePresenceUserIds(userIds)

    // bodyHash binds this token to exactly boundedUserIds — the route
    // recomputes the same hash over the body it received and rejects on
    // mismatch, so a captured token cannot be replayed with a different member
    // list. workspaceId travels as a query param, not in the JSON body, so the
    // route can verify the token's signature before parsing the body.
    const bodyHash = await hashPresenceUserIds(boundedUserIds)
    const token = await signRealtimeToken(
      { kind: "workspace", id: workspaceId },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      env.REALTIME_BROADCAST_SECRET,
      { bodyHash },
    )
    const url = new URL(
      "/api/workspace-presence/report",
      env.NEXT_PUBLIC_BUILDER_URL,
    )
    url.searchParams.set("workspaceId", workspaceId)
    await ky.post(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      json: { userIds: boundedUserIds },
      retry: 0,
      timeout: 5000,
    })
  } catch (error) {
    logger.error(
      { err: error, workspaceId },
      "Failed to report workspace presence to builder",
    )
  }
}
