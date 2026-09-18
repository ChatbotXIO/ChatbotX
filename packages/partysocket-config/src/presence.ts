/**
 * The presence-reporting contract, owned in one place so its two timing
 * constants can never drift apart — when the interval once equalled the TTL,
 * every reported member expired on every cycle. Imported by `apps/realtime` and
 * `packages/business`.
 */
import { z } from "zod"

/** How long one presence report keeps a reported user online in Redis. */
export const PRESENCE_TTL_MS = 20_000

/**
 * Deliberately half the TTL, giving a full report of margin for a slow
 * report. A fully lost report still self-heals: expired members read as
 * newly live on the next successful one, at the cost of one flap.
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

/** Truncates to `MAX_PRESENCE_USER_IDS_PER_REPORT`; never throws. */
export function truncatePresenceUserIds(userIds: readonly string[]): string[] {
  return userIds.slice(0, MAX_PRESENCE_USER_IDS_PER_REPORT)
}

/**
 * Keep-alive frame closing the one gap in server-reported presence:
 * `ensureReportLoopArmed` only fires from `onConnect`/`onRequest`, so a quiet
 * room otherwise never re-arms the alarm. Not an HTTP heartbeat, to avoid
 * per-tab request cost; `ensureReportLoopArmed()` is a no-op while fresh.
 */
export const PRESENCE_PING_MESSAGE_TYPE = "presence-ping" as const

/**
 * Validates an inbound socket frame as a presence ping — the only client-server
 * message this socket carries. Anything else must be ignored, never treated as
 * a liveness signal.
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
 * Binds a presence-report token to its body: the realtime side hashes the ids
 * it's about to POST into a `bodyHash` claim, and the builder route recomputes
 * it over what arrived and rejects a mismatch. Sorted first so argument order
 * never matters. Uses Web Crypto — `node:crypto` doesn't exist in the realtime
 * runtime.
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
