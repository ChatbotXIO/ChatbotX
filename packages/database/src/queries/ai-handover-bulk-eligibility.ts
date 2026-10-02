import {
  and,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import type { AiHandoverBulkAction } from "../partials/ai-handover"
import {
  THREAD_IDLE_AFTER_MS,
  threadControlRoles,
} from "../partials/thread-control"
import { contactInboxModel } from "../schema"

// LEAF module (imports only the schema and partials), like `ad-referral.ts`.
// Table columns are read inside functions, never at module scope, so a suite
// that mocks the schema narrowly can still import this file.

export type BulkEligibilityInput = {
  action: AiHandoverBulkAction
  /** Run's request time: a thread changed after it is respected and skipped. */
  requestedAt: Date
  now: Date
  /** Disable: the channel's takeover-message window; enable: the activity window. */
  lastIncomingSince: Date
}

/**
 * SQL form of `resolveThreadControlState(...) === "standby"` (partials/
 * thread-control.ts): a stored `standby` is still held while the channel's
 * expiry is in the future, or — with no expiry — while the latest of the last
 * user message and the last transition is within the idle window. `GREATEST`
 * ignores NULLs; with no reference time at all the stored state is kept.
 */
const isHeldStandby = (now: Date): SQL => {
  const idleBefore = new Date(now.getTime() - THREAD_IDLE_AFTER_MS)
  return sql`(${contactInboxModel.threadControlState} = 'standby' AND CASE
    WHEN ${contactInboxModel.threadOwnerExpiresAt} IS NOT NULL
      THEN ${contactInboxModel.threadOwnerExpiresAt} > ${now}
    ELSE COALESCE(
      GREATEST(${contactInboxModel.lastIncomingMessageAt}, ${contactInboxModel.threadControlUpdatedAt}),
      'infinity'::timestamptz
    ) > ${idleBefore}
  END)`
}

const notNewerThanRequest = (requestedAt: Date): SQL =>
  or(
    isNull(contactInboxModel.threadControlUpdatedAt),
    lte(contactInboxModel.threadControlUpdatedAt, requestedAt),
  ) as SQL

/**
 * The one definition of "this thread is touched by a bulk run", shared by the
 * page query and the count so they can never disagree.
 *
 * - enable: not held by anyone right now (never observed / owned / idle, or a
 *   standby that already expired), active within the window.
 * - disable: held by the AI agent right now, inside the channel's takeover-message window.
 */
export const bulkEligibilityConditions = (
  input: BulkEligibilityInput,
): SQL[] => {
  const { action, requestedAt, now, lastIncomingSince } = input
  const common = [
    isNotNull(contactInboxModel.sourceId),
    gte(contactInboxModel.lastIncomingMessageAt, lastIncomingSince),
    notNewerThanRequest(requestedAt),
  ]
  if (action === "disable") {
    return [
      ...common,
      eq(contactInboxModel.threadControlState, "standby"),
      eq(contactInboxModel.threadOwnerRole, threadControlRoles.enum.ai_agent),
      isHeldStandby(now),
    ]
  }
  // COALESCE: a never-observed thread has a NULL state, which makes the
  // held-standby test NULL, and `NOT NULL` is NULL (the row would be dropped).
  return [...common, sql`NOT COALESCE(${isHeldStandby(now)}, false)`]
}

export const bulkAfterId = (afterId: string | null): SQL | undefined =>
  afterId ? gt(contactInboxModel.id, afterId) : undefined

export const bulkEligibilityWhere = (
  inboxId: string,
  input: BulkEligibilityInput,
  afterId: string | null,
): SQL | undefined =>
  and(
    eq(contactInboxModel.inboxId, inboxId),
    ...bulkEligibilityConditions(input),
    bulkAfterId(afterId),
  )
