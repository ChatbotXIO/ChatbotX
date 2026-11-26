import {
  bigint,
  boolean,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

/**
 * One row per post per workspace-local day on which one of its platform counts
 * was observed to change: a sparse daily snapshot of the cumulative counts plus
 * the signed gain of that day (docs/posts.md, "Post analytics"). RANGE-
 * partitioned by month on `day`; the `PARTITION BY` clause, the DEFAULT
 * partition and the first monthly partitions live in the hand-written part of
 * the migration (drizzle-kit cannot express partitioning, same as
 * `ContactActiveHourly` and `LeaderboardScoreEvent`). The
 * `maintainChannelPostMetricPartitions` cron creates months ahead and drops
 * months past retention.
 *
 * A cumulative count is NULL when the platform never reported it for the post
 * (unknown, not zero); a gain is 0 for a day on which nothing was observed to
 * change, which includes the day of a post's first observation (`isBaseline`:
 * the first listing of a post only seeds the total, it never counts the post's
 * whole lifetime as one day's gain).
 *
 * No foreign keys: a cascade over a table this size is too heavy (same
 * reasoning as `ContactInboxPost`), and `ChannelPost` is never hard-deleted.
 * Workspace purge drains it by `workspaceId` (`PARTITIONED_WORKSPACE_TABLES`).
 * Not copied by templates.
 */
export const channelPostMetricDailyModel = pgTable(
  "ChannelPostMetricDaily",
  {
    workspaceId: bigintAsString().notNull(),
    // The local date, in the workspace time zone of the observation.
    day: date({ mode: "string" }).notNull(),
    channelPostId: bigintAsString().notNull(),
    inboxId: bigintAsString().notNull(),
    channel: text().notNull(),
    commentsCount: bigint({ mode: "number" }),
    reactionsCount: bigint({ mode: "number" }),
    sharesCount: bigint({ mode: "number" }),
    engagementCount: bigint({ mode: "number" }),
    viewsCount: bigint({ mode: "number" }),
    commentsGain: bigint({ mode: "number" }).notNull().default(0),
    reactionsGain: bigint({ mode: "number" }).notNull().default(0),
    sharesGain: bigint({ mode: "number" }).notNull().default(0),
    engagementGain: bigint({ mode: "number" }).notNull().default(0),
    viewsGain: bigint({ mode: "number" }).notNull().default(0),
    isBaseline: boolean().notNull().default(false),
    observedAt: timestamp(timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.day, table.channelPostId],
    }),
    index("ChannelPostMetricDaily_workspaceId_channelPostId_day_idx").on(
      table.workspaceId,
      table.channelPostId,
      table.day,
    ),
    index("ChannelPostMetricDaily_workspaceId_inboxId_day_idx").on(
      table.workspaceId,
      table.inboxId,
      table.day,
    ),
  ],
)
