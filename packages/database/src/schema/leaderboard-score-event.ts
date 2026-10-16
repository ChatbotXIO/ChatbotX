import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { LeaderboardScoreSource } from "../partials/leaderboard"
import { leaderboardScoreSources } from "../partials/leaderboard"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const leaderboardScoreSource = pgEnum(
  "leaderboardScoreSource",
  leaderboardScoreSources.options as [
    LeaderboardScoreSource,
    ...LeaderboardScoreSource[],
  ],
)

/**
 * Append-only history of every score change. The largest leaderboard table
 * (≈1.5M rows for a 10k-player, 30-day campaign), so it is RANGE-partitioned
 * by month on `createdAt`. The `PARTITION BY` clause, the DEFAULT partition
 * and the initial monthly partitions live in the hand-written migration
 * (`drizzle/*_add_leaderboard`) — Drizzle only models the columns, like
 * `ContactActiveHourly`. New months are created and months past retention
 * are dropped by the `maintainLeaderboardPartitions` cron
 * (`repositories/leaderboard-partitions.ts`).
 *
 * Postgres requires every unique constraint on a partitioned table to
 * include the partition key, so idempotency rides on the primary key: an
 * automatic event derives BOTH `id` (a hash of leaderboard + rule +
 * sourceRef) and `createdAt` (the source event's own timestamp) from the
 * source event, so a webhook redelivery or a job retry hits the same key and
 * `ON CONFLICT DO NOTHING` skips it.
 *
 * No foreign keys: cascading deletes over a table this size are too heavy
 * (same reasoning as `ContactInboxPost`). Workspace purge deletes by
 * `workspaceId`; soft-deleted leaderboards age out with their partitions.
 * Admin interventions are ALSO written to `LeaderboardAuditLog`, which is
 * never dropped.
 */
export const leaderboardScoreEventModel = pgTable(
  "LeaderboardScoreEvent",
  {
    id: bigintAsString().notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    leaderboardId: bigintAsString().notNull(),
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    delta: integer().notNull(),
    source: leaderboardScoreSource().notNull(),
    // Rule key for `source = "rule"`, e.g. "comments".
    rule: text(),
    // Id of the triggering thing (comment/message id, email recipient id…).
    sourceRef: text(),
  },
  (table) => [
    primaryKey({ columns: [table.createdAt, table.id] }),
    index("LeaderboardScoreEvent_leaderboardId_createdAt_idx").using(
      "btree",
      table.leaderboardId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("LeaderboardScoreEvent_leaderboardId_contactId_createdAt_idx").using(
      "btree",
      table.leaderboardId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("LeaderboardScoreEvent_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
