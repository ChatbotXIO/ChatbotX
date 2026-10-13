import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  broadcastOccurrenceOutcomes,
  broadcastOccurrenceReasons,
} from "../partials/broadcast"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { broadcastRecurrenceModel } from "./broadcast-recurrence"
import { workspaceModel } from "./workspace"

export const broadcastOccurrenceOutcome = pgEnum(
  "broadcastOccurrenceOutcome",
  broadcastOccurrenceOutcomes.options as [string, ...string[]],
)
export const broadcastOccurrenceReason = pgEnum(
  "broadcastOccurrenceReason",
  broadcastOccurrenceReasons.options as [string, ...string[]],
)

/**
 * The ledger of a repeating broadcast: one row per logical slot, written in
 * the same transaction that advances the schedule, so a day that was not sent
 * is still accounted for — with the reason.
 */
export const broadcastRecurrenceOccurrenceModel = pgTable(
  "BroadcastRecurrenceOccurrence",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    recurrenceId: bigintAsString()
      .notNull()
      .references(() => broadcastRecurrenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Logical slot id `YYYY-MM-DD HH:mm` in the rule's timezone; stays distinct even when two slots resolve to one instant. */
    localSlot: text().notNull(),
    occurrenceAt: timestamp(timestampConfig).notNull(),
    outcome: broadcastOccurrenceOutcome().notNull(),
    reason: broadcastOccurrenceReason(),
    /** The run, when `outcome` is `created`. `set null` keeps the ledger if the run is deleted. */
    childBroadcastId: bigintAsString().references(() => broadcastModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** When the decision was taken; `materializedAt - occurrenceAt` is how late the slot was handled. */
    materializedAt: timestamp(timestampConfig).notNull(),
    /** More than 1 only on a summary row that stands in for an oversized backfill. */
    supersededCount: integer().notNull().default(1),
  },
  (table) => [
    // The instant is part of the key: `localSlot` is wall-clock text in the
    // rule's zone at the time, so after a timezone edit the same text can name
    // a different instant, and two texts can name one instant (a DST collapse).
    uniqueIndex(
      "BroadcastRecurrenceOccurrence_recurrenceId_localSlot_occurrenceAt_key",
    ).on(table.recurrenceId, table.localSlot, table.occurrenceAt),
    index("BroadcastRecurrenceOccurrence_recurrenceId_occurrenceAt_idx").on(
      table.recurrenceId,
      table.occurrenceAt.desc(),
    ),
    index("BroadcastRecurrenceOccurrence_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("BroadcastRecurrenceOccurrence_childBroadcastId_idx").using(
      "btree",
      table.childBroadcastId.asc().nullsLast(),
    ),
  ],
)
