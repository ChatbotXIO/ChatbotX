/**
 * The presence-reporting contract, owned in ONE place so its two timing
 * constants can never drift apart — when the interval once equalled the
 * TTL, every reported member expired on every cycle. Imported by
 * `apps/realtime` (the `workspaces` room's alarm loop) and
 * `packages/business` (`workspacePresenceService`). See `docs/realtime.md`.
 */
import { z } from "zod"

/** How long one presence report keeps a reported user online in Redis. */
export const PRESENCE_TTL_MS = 20_000

/**
 * How often the realtime server re-reports a room's connected user ids —
 * deliberately HALF the TTL. The alarm reschedules itself BEFORE awaiting
 * the POST, so the write-to-write gap is this constant regardless of
 * latency, leaving a full report of margin under the TTL.
 *
 * That margin covers a SLOW report: the next one still lands inside the
 * window. It does not cover a fully LOST one — the members it would have
 * renewed expire, then read as newly live on the next successful report,
 * costing one bulk `UPDATE` and a brief, self-healing flap.
 */
export const PRESENCE_REPORT_INTERVAL_MS = 10_000

if (PRESENCE_REPORT_INTERVAL_MS * 2 > PRESENCE_TTL_MS) {
  // Import-time failure in every environment that pulls this in — defense in
  // depth behind the guard test in `__tests__/presence.test.ts`.
  throw new Error(
    "presence config invariant violated: PRESENCE_REPORT_INTERVAL_MS * 2 must be <= PRESENCE_TTL_MS",
  )
}

/**
 * Cap on user ids per report. Both ends truncate rather than reject, so an
 * oversized room reports its first N members instead of going dark.
 */
export const MAX_PRESENCE_USER_IDS_PER_REPORT = 5000

/** Truncates to {@link MAX_PRESENCE_USER_IDS_PER_REPORT}; never throws. */
export function truncatePresenceUserIds(userIds: readonly string[]): string[] {
  return userIds.slice(0, MAX_PRESENCE_USER_IDS_PER_REPORT)
}

/**
 * Client→server keep-alive frame on the ALREADY-OPEN workspace websocket.
 *
 * It closes the one gap in server-reported presence: `ensureReportLoopArmed`
 * (`apps/realtime/src/parties/workspaces.ts`) only runs from `onConnect` and
 * `onRequest`, so a quiet room — open tabs, no new connections, no
 * broadcasts — has no trigger. If the alarm loop stopped there, presence
 * would expire after {@link PRESENCE_TTL_MS} with still-connected tabs and
 * nothing to notice it.
 *
 * Not an HTTP heartbeat (that per-tab design was dropped on cost): one more
 * frame on a socket the tab already holds, at the same cadence as the
 * server's own loop so the two cannot drift. `onMessage` validates it and
 * calls the freshness-gated `ensureReportLoopArmed()`, a no-op while the
 * marker is fresh — so N tabs pinging cost nothing until the loop is
 * actually stale.
 */
export const PRESENCE_PING_MESSAGE_TYPE = "presence-ping" as const

/**
 * Validates an inbound socket frame as a presence ping — the only
 * client→server message this socket carries. Anything else (malformed JSON,
 * unknown type) must be ignored, never treated as a liveness signal.
 */
export const presencePingMessageSchema = z.object({
  type: z.literal(PRESENCE_PING_MESSAGE_TYPE),
})

export type PresencePingMessage = z.infer<typeof presencePingMessageSchema>

/** The exact wire frame the client sends, paired with the schema above. */
export function serializePresencePingMessage(): string {
  return JSON.stringify({
    type: PRESENCE_PING_MESSAGE_TYPE,
  } satisfies PresencePingMessage)
}

/**
 * Binds a presence-report token to its body: the realtime side hashes the
 * ids it is about to POST into a `bodyHash` claim, and the builder route
 * recomputes it over what arrived and rejects a mismatch. Sorted first so
 * argument order never matters. Uses Web Crypto — `node:crypto` does not
 * exist in the realtime runtime.
 */
export async function hashPresenceUserIds(
  userIds: readonly string[],
): Promise<string> {
  const canonical = [...userIds].sort().join(",")
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
