import { type SQL, sql } from "@chatbotx.io/database/client"

/**
 * SQL fragment builders for the DM "waiting for a human reply" window on
 * `Conversation` (`awaitingHumanReplySince` / `awaitingHumanReplyClosedAt`).
 *
 * Every builder returns expressions meant for the SET clause of an UPDATE the
 * caller already runs, so they read the row's pre-update values and cost no
 * extra query. Column names are literal (the unqualified name in a SET
 * expression is the target row) and every value is a bound parameter.
 *
 * Invariants shared by all transitions:
 * - DM only: a comment thread (`"sourceId" IS NOT NULL`) never opens/closes.
 * - Stale-event guard: `awaitingHumanReplyClosedAt` is the last HUMAN close;
 *   an open at or before it is ignored (delayed/retried inbound webhooks).
 * - Only the `bot` actor is guarded by `"botEnabled"`: a paused conversation
 *   is waiting for a human, so a bot send must not close its window.
 */
type HumanReplyWindowCloseActor = "bot" | "externalHuman" | "archive"

export type HumanReplyWindowTransition =
  | { open: Date }
  | { close: Date; actor: HumanReplyWindowCloseActor }

type HumanReplyWindowSet = {
  awaitingHumanReplySince: SQL
  awaitingHumanReplyClosedAt?: SQL
}

const ts = (at: Date): SQL => sql`${at.toISOString()}::timestamptz`

const buildOpen = (at: Date): HumanReplyWindowSet => ({
  awaitingHumanReplySince: sql`CASE WHEN "sourceId" IS NOT NULL OR ${ts(at)} <= COALESCE("awaitingHumanReplyClosedAt", '-infinity'::timestamptz) THEN "awaitingHumanReplySince" ELSE LEAST(COALESCE("awaitingHumanReplySince", ${ts(at)}), ${ts(at)}) END`,
})

// Close applies only to a DM; for the bot actor also only while the bot is
// enabled (a paused conversation is waiting for a human). When it does not
// apply, neither column moves.
const closeGuard = (actor: HumanReplyWindowCloseActor): SQL =>
  actor === "bot"
    ? sql`"sourceId" IS NULL AND "botEnabled"`
    : sql`"sourceId" IS NULL`

// Only a HUMAN close (external echo, archive; the reply claim does the same in
// the repository) advances the stale-event marker. A bot close clears the
// window but leaves the marker alone, so "contact writes -> bot says it is
// connecting an agent -> bot is paused" can still reopen the window at the
// contact's message. Accepted edge: an out-of-order older inbound arriving
// after a bot close can reopen a window (no stale guard for bot closes).
const buildClose = (
  at: Date,
  actor: HumanReplyWindowCloseActor,
): HumanReplyWindowSet => {
  const awaitingHumanReplySince = sql`CASE WHEN ${closeGuard(actor)} AND "awaitingHumanReplySince" IS NOT NULL AND "awaitingHumanReplySince" <= ${ts(at)} THEN NULL ELSE "awaitingHumanReplySince" END`
  if (actor === "bot") {
    return { awaitingHumanReplySince }
  }
  return {
    awaitingHumanReplySince,
    awaitingHumanReplyClosedAt: sql`CASE WHEN ${closeGuard(actor)} THEN GREATEST(COALESCE("awaitingHumanReplyClosedAt", '-infinity'::timestamptz), ${ts(at)}) ELSE "awaitingHumanReplyClosedAt" END`,
  }
}

/** SET expressions for one explicit window transition. */
export const humanReplyWindowSet = (
  transition: HumanReplyWindowTransition,
): HumanReplyWindowSet =>
  "open" in transition
    ? buildOpen(transition.open)
    : buildClose(transition.close, transition.actor)

/**
 * Pause / handover: reopen the window only when the contact's last DM message
 * is still unanswered (newer than the last human reply and the last human
 * close; a bot close does not count).
 */
export const reopenIfUnansweredSince = (): SQL =>
  sql`CASE WHEN "awaitingHumanReplySince" IS NULL AND "sourceId" IS NULL AND "contactRepliedAt" > COALESCE("adminRepliedAt", '-infinity'::timestamptz) AND "contactRepliedAt" > COALESCE("awaitingHumanReplyClosedAt", '-infinity'::timestamptz) THEN "contactRepliedAt" ELSE "awaitingHumanReplySince" END`
