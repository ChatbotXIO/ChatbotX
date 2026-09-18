/**
 * The presence-reporting pair every component in the flow must agree on —
 * owned in exactly ONE place so the two constants can never drift apart
 * again (that drift was HIGH-1: the report interval equalled the TTL, so
 * the write-to-write gap between two reports always exceeded the TTL and
 * every reported member expired every cycle). Imported by both
 * `apps/realtime` (the `workspaces` room's alarm loop) and
 * `packages/business` (`workspacePresenceService`) — see
 * `docs/whatsapp-calling-parity-plan.md` §9.
 */
import { z } from "zod"

/**
 * How long a single presence report keeps a reported user "online" in
 * Redis. Matches a widely used reference presence-tracker's duration —
 * kept at 20s rather than tuned down, per owner decision.
 */
export const PRESENCE_TTL_MS = 20_000

/**
 * How often the realtime server re-reports a room's connected user ids.
 * Deliberately HALF of {@link PRESENCE_TTL_MS} (not equal to it): the alarm
 * that drives this is rescheduled for `now + PRESENCE_REPORT_INTERVAL_MS`
 * BEFORE awaiting the report POST (fixed cadence, latency-independent — see
 * `apps/realtime/src/parties/workspaces.ts`'s `onAlarm`), so the
 * write-to-write gap between two reports is this constant, with a full
 * report's worth of margin left under the TTL. Precisely what that margin
 * protects: a single SLOW report (high latency, but it still eventually
 * lands) never flaps a still-connected member offline, because the NEXT
 * report is sent on the same fixed cadence regardless of how long the slow
 * one took, so it still renews the TTL well inside the window. A single
 * fully LOST report is NOT protected the same way — a member it would have
 * renewed gets its next renewal exactly `PRESENCE_REPORT_INTERVAL_MS` late
 * (from the following report), which lands right at the TTL boundary,
 * likely after it given normal network jitter/latency: that member's Redis
 * entry expires, it reads as "newly live" again on the next successful
 * report, and the room fires one bulk `UPDATE` for it (and every other
 * member the same lost report would have renewed) — a real, if brief and
 * self-healing, flap.
 */
export const PRESENCE_REPORT_INTERVAL_MS = 10_000

if (PRESENCE_REPORT_INTERVAL_MS * 2 > PRESENCE_TTL_MS) {
  // Fails fast, at import time, in every environment that pulls in this
  // module — defense in depth alongside the guard test in
  // `__tests__/presence.test.ts`, which is the primary enforcement.
  throw new Error(
    "presence config invariant violated: PRESENCE_REPORT_INTERVAL_MS * 2 must be <= PRESENCE_TTL_MS",
  )
}

/**
 * Bound on how many user ids a single presence report may carry. Shared by
 * both ends of the report: the realtime party truncates to this before
 * ever sending (LOW-7 — a room bigger than this must never turn the whole
 * workspace offline by having its report rejected outright), and the
 * builder's report route truncates the same way rather than 400ing, so it
 * stays tolerant of a batch that somehow arrives over the cap anyway.
 */
export const MAX_PRESENCE_USER_IDS_PER_REPORT = 5000

/**
 * Truncates `userIds` to {@link MAX_PRESENCE_USER_IDS_PER_REPORT}. Never
 * throws and never represents "rejected" — an oversized room simply
 * reports its first N connected members rather than going dark entirely.
 */
export function truncatePresenceUserIds(userIds: readonly string[]): string[] {
  return userIds.slice(0, MAX_PRESENCE_USER_IDS_PER_REPORT)
}

/**
 * The client→server keep-alive frame sent over the ALREADY-OPEN workspace
 * websocket (a widely used pattern: a heartbeat sent every 20s over the
 * same already-open socket rather than a new connection —
 * see `docs/whatsapp-calling-parity-plan.md`'s Codex release-
 * blocker note). It exists to fix a gap in the server-reported presence
 * design above: `ensureReportLoopArmed` (`apps/realtime/src/parties/
 * workspaces.ts`) is only ever consulted from `onConnect` and inbound
 * `onRequest`. A QUIET room — an already-open tab, no new connections, no
 * broadcasts — has neither trigger, so if the alarm loop silently stops,
 * presence would expire after {@link PRESENCE_TTL_MS} even though tabs are
 * still connected, with no independent liveness signal to notice and
 * recover it.
 *
 * The ping is deliberately NOT a new HTTP heartbeat (that per-tab design
 * was removed for cost reasons — see this file's other exports' doc
 * comments) — it is one more frame on the socket the tab already holds
 * open, at the SAME cadence as the server's own report loop
 * ({@link PRESENCE_REPORT_INTERVAL_MS}) so the pair can never drift. The
 * party's `onMessage` handler validates it against
 * {@link presencePingMessageSchema} and calls the existing freshness-gated
 * `ensureReportLoopArmed()` — a no-op whenever the marker is already fresh,
 * so a room with N tabs pinging every interval costs no extra storage
 * write or report in the common case; it only matters the one time the
 * loop has actually gone stale.
 */
export const PRESENCE_PING_MESSAGE_TYPE = "presence-ping" as const

/** Validates an inbound socket frame as a presence keep-alive ping — the
 * ONLY client→server message this socket carries today. Anything that
 * fails this (malformed JSON, a different shape, a stale/unknown message
 * type) must be ignored by the party, never treated as a liveness signal. */
export const presencePingMessageSchema = z.object({
  type: z.literal(PRESENCE_PING_MESSAGE_TYPE),
})

export type PresencePingMessage = z.infer<typeof presencePingMessageSchema>

/** Builds the exact wire frame the builder client sends — the one place
 * that owns the client-side serialization, paired with
 * {@link presencePingMessageSchema} so the two can never drift apart. */
export function serializePresencePingMessage(): string {
  return JSON.stringify({
    type: PRESENCE_PING_MESSAGE_TYPE,
  } satisfies PresencePingMessage)
}

/**
 * Deterministic hex SHA-256 digest binding a presence-report token to its
 * body (MEDIUM-3): the realtime side computes this over the exact
 * (already-truncated) `userIds` it is about to POST and carries it as a
 * `bodyHash` claim in the token; the builder route recomputes it over the
 * body it actually received and rejects on mismatch. Sorted first so
 * argument order never matters on either side. Uses the standard Web
 * Crypto API (`crypto.subtle`), available in both the realtime server's
 * Cloudflare-Workers-style runtime and Node — never `node:crypto`, which
 * the realtime runtime does not have.
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
