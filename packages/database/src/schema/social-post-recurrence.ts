import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type SocialPostRecurrenceOutcome,
  socialPostRecurrenceOutcomes,
} from "../partials/social-post"
import { socialPostModel } from "./social-post"
import { workspaceModel } from "./workspace"

export const socialPostRecurrenceOutcome = pgEnum(
  "socialPostRecurrenceOutcome",
  socialPostRecurrenceOutcomes.options as [
    SocialPostRecurrenceOutcome,
    ...SocialPostRecurrenceOutcome[],
  ],
)

/**
 * The schedule of a repeating post, 1-1 with its template `SocialPost` (a
 * draft that is never published itself). Each due slot spawns a child post
 * (`parentSocialPostId`) that is scheduled for that slot.
 */
export const socialPostRecurrenceModel = pgTable(
  "SocialPostRecurrence",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    socialPostId: bigintAsString()
      .notNull()
      .references(() => socialPostModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Validated with `recurrenceRuleSchema` at every write. */
    rule: jsonb().$type<RecurrenceRule>().notNull(),
    /** The next slot to materialise; null once the series is exhausted. */
    nextRunAt: timestamp(timestampConfig),
    /** Every slot at or before this instant has a ledger row. */
    accountedThroughAt: timestamp(timestampConfig),
    /** Occurrences created so far; what `afterOccurrences` is measured against. */
    occurrenceCount: integer().notNull().default(0),
    pausedAt: timestamp(timestampConfig),
    endedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("SocialPostRecurrence_socialPostId_key").on(table.socialPostId),
    index("SocialPostRecurrence_workspaceId_idx").on(table.workspaceId),
    // Serves the per-minute due scan: a running series ordered by its next slot.
    index("SocialPostRecurrence_due_idx")
      .on(table.nextRunAt, table.id)
      .where(sql`${table.endedAt} IS NULL AND ${table.pausedAt} IS NULL`),
  ],
)

/**
 * The ledger of a repeating post: one row per slot, written in the same
 * transaction that advances the series, so a date that produced no post is
 * still accounted for.
 */
export const socialPostRecurrenceOccurrenceModel = pgTable(
  "SocialPostRecurrenceOccurrence",
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
      .references(() => socialPostRecurrenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** `YYYY-MM-DD HH:mm` in the rule's zone when the slot was taken; immutable. */
    localSlot: text().notNull(),
    occurrenceAt: timestamp(timestampConfig).notNull(),
    outcome: socialPostRecurrenceOutcome().notNull(),
    /** The occurrence post, when `outcome` is `created`; kept as history if it is deleted. */
    socialPostId: bigintAsString().references(() => socialPostModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    // The instant is part of the key for the same reason as the broadcast
    // ledger: a time zone edit or a DST change can make one wall-clock text name
    // two instants, or two texts one.
    uniqueIndex(
      "SocialPostRecurrenceOccurrence_recurrenceId_localSlot_occurrenceAt_key",
    ).on(table.recurrenceId, table.localSlot, table.occurrenceAt),
    index("SocialPostRecurrenceOccurrence_recurrenceId_occurrenceAt_idx").on(
      table.recurrenceId,
      table.occurrenceAt.desc(),
      table.id.desc(),
    ),
    index("SocialPostRecurrenceOccurrence_workspaceId_idx").on(
      table.workspaceId,
    ),
    index("SocialPostRecurrenceOccurrence_socialPostId_idx")
      .on(table.socialPostId)
      .where(sql`${table.socialPostId} IS NOT NULL`),
  ],
)
