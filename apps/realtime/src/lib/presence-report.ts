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
 * POSTs the distinct set of currently-connected user ids for `workspaceId`
 * to the builder's presence-report route
 * (`apps/builder/src/app/api/workspace-presence/report/route.ts`) — the
 * realtime server's periodic (`workspaces.ts`'s alarm loop) mirror of "who
 * has this workspace open right now" into Redis, replacing the old
 * one-server-action-per-browser-tab design.
 *
 * Authenticated with the SAME shared secret and JWT scheme
 * (`signRealtimeToken`) `apps/realtime/src/lib/realtime-auth.ts` already
 * uses to verify INBOUND broadcast requests FROM the builder — this is
 * that mechanism used in the opposite direction, never a new one. Built as
 * a full absolute URL via `env.NEXT_PUBLIC_BUILDER_URL` the same way
 * `lib/auth.ts`'s `getAuthSession` already calls back into the builder from
 * inside a party.
 *
 * Best-effort, log-and-degrade: a failed report (network error, builder
 * down, Redis down on the builder's side — that route itself never
 * surfaces a Redis failure as anything other than 200) is logged and
 * swallowed, never thrown. There is no retry: the next report fires in
 * {@link import("../parties/workspaces").PRESENCE_REPORT_INTERVAL_MS} and
 * supersedes a lost one, so retrying a stale one here would only waste
 * work.
 */
export async function reportWorkspacePresence(
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  try {
    // LOW-7: bounded here (before hashing/sending), not left for the route
    // to reject — a room bigger than the cap must never turn the whole
    // workspace offline by having its report 400 outright.
    const boundedUserIds = truncatePresenceUserIds(userIds)

    // MEDIUM-3: `bodyHash` binds this token to exactly `boundedUserIds` —
    // the route recomputes the same hash over the body it received and
    // rejects on mismatch, so a captured token cannot be replayed with a
    // different member list. `workspaceId` travels as a query param (not
    // in the JSON body) so the route can verify the token's signature
    // BEFORE ever parsing the body.
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
