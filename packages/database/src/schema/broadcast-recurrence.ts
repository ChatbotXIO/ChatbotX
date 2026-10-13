import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { workspaceModel } from "./workspace"

/**
 * The schedule of a repeating broadcast, 1-1 with its template `Broadcast`.
 * Each due slot spawns a child `Broadcast` (a run) so the existing send and
 * statistics pipeline works on it unchanged.
 */
export const broadcastRecurrenceModel = pgTable(
  "BroadcastRecurrence",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    broadcastId: bigintAsString()
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Validated with `recurrenceRuleSchema` at every write. No `.default()`: write it explicitly. */
    rule: jsonb().$type<RecurrenceRule>().notNull(),
    /** The next slot to materialize. The series is armed if and only if this is not null. */
    nextRunAt: timestamp(timestampConfig),
    /** Every slot at or before this instant has a ledger row. */
    accountedThroughAt: timestamp(timestampConfig),
    /** Runs created so far; the lifetime count `afterOccurrences` is measured against. */
    occurrenceCount: integer().notNull().default(0),
    lastOccurrenceAt: timestamp(timestampConfig),
    pausedAt: timestamp(timestampConfig),
    endedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("BroadcastRecurrence_broadcastId_key").on(table.broadcastId),
    index("BroadcastRecurrence_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    // Serves the per-minute due scan: keyset order (nextRunAt, id).
    index("BroadcastRecurrence_due_idx")
      .on(table.nextRunAt, table.id)
      .where(sql`"nextRunAt" IS NOT NULL`),
  ],
)
