import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  BroadcastOccurrenceOutcome,
  BroadcastOccurrenceReason,
} from "@chatbotx.io/database/partials"
import {
  type LedgerRowInput,
  broadcastRecurrenceRepository as repository,
} from "@chatbotx.io/database/repositories"
import type { BroadcastRecurrenceModel } from "@chatbotx.io/database/types"
import {
  listOccurrencesBetween,
  toLocalSlot,
} from "@chatbotx.io/utils/recurrence"

/**
 * Stopping a series and accounting its ledger. Kept free of the plan and
 * workspace services so low-level callers (workspace teardown) can use it
 * without pulling the broadcast service graph in.
 */

/** Ledger rows written by one backfill; older slots collapse into a single summary row. */
const MAX_LEDGER_BACKFILL_ROWS = 500
/** Slots enumerated by one backfill (about 13 years of a daily series). */
const MAX_BACKFILL_SLOTS_COUNTED = 5000
export type DisarmReason = "paused" | "draft" | "deleted"

/** Why a slot that was due while the series was disarmed was not sent; `null` = not worth a ledger row. */
const LEDGER_REASON_BY_DISARM: Record<
  DisarmReason,
  BroadcastOccurrenceReason | null
> = {
  paused: "paused",
  draft: "draft",
  deleted: null,
}

const DISARM_PATCH: Record<
  DisarmReason,
  (
    now: Date,
  ) => Partial<
    Pick<BroadcastRecurrenceModel, "nextRunAt" | "pausedAt" | "endedAt">
  >
> = {
  paused: (now) => ({ nextRunAt: null, pausedAt: now }),
  draft: () => ({ nextRunAt: null, pausedAt: null }),
  deleted: () => ({ nextRunAt: null }),
}

/**
 * Writes a ledger row for every slot in `(accountedThroughAt, through]`, so a
 * stretch the series did not send (a pause, an outage) still shows up with its
 * reason. A backlog beyond {@link MAX_LEDGER_BACKFILL_ROWS} collapses its
 * oldest slots into one summary row, so a transaction never writes unbounded
 * rows. The caller advances `accountedThroughAt` in its own patch.
 */
export const accountSlots = async (
  tx: DatabaseClient,
  input: {
    recurrence: BroadcastRecurrenceModel
    through: Date
    outcome: Extract<BroadcastOccurrenceOutcome, "skipped" | "missed">
    reason: BroadcastOccurrenceReason
    now: Date
  },
): Promise<void> => {
  const { recurrence, through, now } = input
  const lowerBound = recurrence.accountedThroughAt
  if (!lowerBound || lowerBound >= through) {
    return
  }
  const slots = listOccurrencesBetween(recurrence.rule, {
    after: lowerBound,
    through,
    occurrenceCount: recurrence.occurrenceCount,
    limit: MAX_BACKFILL_SLOTS_COUNTED,
  })
  if (slots.length === 0) {
    return
  }

  const individualCount = Math.min(slots.length, MAX_LEDGER_BACKFILL_ROWS - 1)
  const olderCount = slots.length - individualCount
  const toRow = (slot: Date, supersededCount: number): LedgerRowInput => ({
    workspaceId: recurrence.workspaceId,
    recurrenceId: recurrence.id,
    localSlot: toLocalSlot(slot, recurrence.rule.timezone),
    occurrenceAt: slot,
    outcome: input.outcome,
    reason: input.reason,
    childBroadcastId: null,
    materializedAt: now,
    supersededCount,
  })
  // A backlog beyond the cap collapses its oldest slots into one summary row.
  const summary = olderCount > 0 ? [toRow(slots[0], olderCount)] : []
  const individual = slots.slice(olderCount).map((slot) => toRow(slot, 1))
  await repository.insertLedgerRows(tx, [...summary, ...individual])
}

/** Editing a paused series ends the pause: the slots until now were skipped because of it. */
const pauseReasonOf = (
  recurrence: BroadcastRecurrenceModel,
  reason: DisarmReason,
): "paused" | null =>
  recurrence.pausedAt && reason === "draft" ? "paused" : null

/** Stops the series, first accounting any slot that was already due but not yet taken. */
export const disarmSeries = async (
  tx: DatabaseClient,
  input: {
    recurrence: BroadcastRecurrenceModel
    reason: DisarmReason
    now: Date
  },
): Promise<void> => {
  const { recurrence, reason, now } = input
  const armed = recurrence.nextRunAt !== null

  // Slots already due are accounted to the reason they were not taken. Editing
  // a paused series ends the pause here, so the slots until now are still the
  // pause's; from now on they are the edit's ("draft").
  const accountAs = armed
    ? LEDGER_REASON_BY_DISARM[reason]
    : pauseReasonOf(recurrence, reason)
  if (accountAs) {
    await accountSlots(tx, {
      recurrence,
      through: now,
      outcome: "skipped",
      reason: accountAs,
      now,
    })
  }
  await repository.update(tx, {
    id: recurrence.id,
    patch: {
      ...DISARM_PATCH[reason](now),
      ...(accountAs ? { accountedThroughAt: now } : {}),
    },
  })
}

/** Workspace teardown: locks, accounts and stops every armed series of a workspace. */
export const disarmAllSeriesForWorkspace = async (
  tx: DatabaseClient,
  input: { workspaceId: string },
): Promise<number> => {
  const now = await repository.selectDbNow(tx)
  const locked = await repository.lockAllForWorkspace(tx, input)
  let disarmed = 0
  for (const recurrence of locked) {
    if (recurrence.nextRunAt) {
      await disarmSeries(tx, { recurrence, reason: "paused", now })
      disarmed += 1
    }
  }
  return disarmed
}
