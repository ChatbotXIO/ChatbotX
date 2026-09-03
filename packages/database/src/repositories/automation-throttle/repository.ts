import { and, db, eq, sql } from "../../client"
import type { AutomationThrottleType } from "../../partials"
import { automationThrottleModel } from "../../schema"

/** Retention window for `purgeStaleAutomationThrottles`. */
const STALE_RETENTION_HOURS = 48

type ThrottleSubject = {
  workspaceId: string
  contactInboxId: string
  throttleType: AutomationThrottleType
  subjectId: string
}

export type ThrottleClaimOutcome =
  | { won: true; claimId: string; remainingSeconds: number }
  | { won: false; remainingSeconds: number }

const remainingSecondsExpr = (windowSeconds: number) =>
  sql<number>`greatest(0, ceil(extract(epoch from (${automationThrottleModel.lastTriggeredAt} + make_interval(secs => ${windowSeconds}) - now()))))::int`

const subjectFilter = (subject: ThrottleSubject) =>
  and(
    eq(automationThrottleModel.workspaceId, subject.workspaceId),
    eq(automationThrottleModel.contactInboxId, subject.contactInboxId),
    eq(automationThrottleModel.throttleType, subject.throttleType),
    eq(automationThrottleModel.subjectId, subject.subjectId),
  )

/**
 * Atomically claims a throttle slot. A bounded window (`windowSeconds` > 0)
 * only wins if `lastTriggeredAt` is already outside the window — the row-lock
 * on the conflicting tuple plus that predicate yields exactly one winner under
 * concurrent callers (the desired throttle). An unbounded window
 * (`windowSeconds` 0) always wins: it re-records `lastTriggeredAt` and allows,
 * so switching to a bounded frequency later throttles from the real last
 * trigger. Idempotent on re-run.
 */
export async function claimAutomationThrottle(
  subject: ThrottleSubject & { windowSeconds: number; claimId: string },
): Promise<ThrottleClaimOutcome> {
  const { windowSeconds, claimId } = subject

  // Unbounded (0) omits the window predicate. `now()` is transaction-start
  // time, so under a concurrent ON CONFLICT wait a loser's `now()` can predate
  // the winner's freshly written `lastTriggeredAt`; a `<= now() - interval '0s'`
  // guard would then wrongly deny it. No predicate => the DO UPDATE always wins
  // and records — never a false deny for "always allow".
  const windowPredicate =
    windowSeconds === 0
      ? undefined
      : sql`${automationThrottleModel.lastTriggeredAt} <= now() - make_interval(secs => ${windowSeconds})`

  const [won] = await db
    .insert(automationThrottleModel)
    .values({
      workspaceId: subject.workspaceId,
      contactInboxId: subject.contactInboxId,
      throttleType: subject.throttleType,
      subjectId: subject.subjectId,
      lastTriggeredAt: sql`now()`,
      claimId,
    })
    .onConflictDoUpdate({
      target: [
        automationThrottleModel.workspaceId,
        automationThrottleModel.contactInboxId,
        automationThrottleModel.throttleType,
        automationThrottleModel.subjectId,
      ],
      set: { lastTriggeredAt: sql`now()`, claimId },
      setWhere: windowPredicate,
    })
    .returning({ remainingSeconds: remainingSecondsExpr(windowSeconds) })

  if (won) {
    return { won: true, claimId, remainingSeconds: won.remainingSeconds }
  }

  // Conflict + setWhere false => no row returned by the upsert. A denied
  // claim still needs the DB-computed remaining seconds (never the app
  // clock) for the negative Redis marker TTL, so a required follow-up SELECT
  // reads the row that won the conflict.
  const [existing] = await db
    .select({ remainingSeconds: remainingSecondsExpr(windowSeconds) })
    .from(automationThrottleModel)
    .where(subjectFilter(subject))

  // If the row vanished between the failed upsert and this SELECT (a concurrent
  // `release` deleted it), return 0 so the caller does NOT cache a denial:
  // `fastPathTtl(0)` skips the Redis marker and the next message re-consults
  // Postgres immediately (which will now allow it). Caching the full window
  // here would wrongly suppress replies for up to the marker TTL.
  return {
    won: false,
    remainingSeconds: existing?.remainingSeconds ?? 0,
  }
}

/**
 * Rolls back a claim by deleting the row keyed by its `claimId` (CAS): a
 * delayed release becomes a no-op once a newer claim has replaced the row, and
 * deleting always restores eligibility for both the insert and update cases —
 * no previous-value bookkeeping needed.
 *
 * Returns `true` only when this call actually deleted its own row, so the
 * caller can skip evicting the Redis marker when the CAS matched nothing (a
 * newer claim already owns the row and its marker).
 */
export async function releaseAutomationThrottle(
  subject: ThrottleSubject & { claimId: string },
): Promise<boolean> {
  const deleted = await db
    .delete(automationThrottleModel)
    .where(
      and(
        subjectFilter(subject),
        eq(automationThrottleModel.claimId, subject.claimId),
      ),
    )
    .returning({ claimId: automationThrottleModel.claimId })

  return deleted.length > 0
}

/**
 * Deletes rows whose last trigger is older than the retention window and
 * returns the count. Uses a bulk `DELETE` with a DB-side `rowCount` (mirrors
 * `cleanupOldWebhookExecutions`) so a large purge never materializes the
 * deleted rows into app memory. `cutoff` is a bound parameter (no injection).
 */
export async function purgeStaleAutomationThrottles(
  olderThanHours: number = STALE_RETENTION_HOURS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
  const result = await db.execute(
    sql`DELETE FROM ${automationThrottleModel} WHERE ${automationThrottleModel.lastTriggeredAt} < ${cutoff}`,
  )

  return Number(result.rowCount ?? 0)
}
