import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core"
import type {
  LeaderboardBreakdown,
  LeaderboardDailyCounts,
} from "../partials/leaderboard"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { contactModel } from "./contact"
import { leaderboardModel } from "./leaderboard"
import { workspaceModel } from "./workspace"

/**
 * One row per (leaderboard, contact) — the source of truth for a score. The
 * Redis sorted set `lb:{id}:rank` is a rebuildable copy of
 * `(score DESC, scoredAt ASC)`.
 *
 * Daily caps and the anti-spam cooldown live on this row (not in Redis) and
 * are checked inside the same UPSERT that adds the points, so a burst of
 * concurrent events can never exceed `maxPerDay` and no per-event Redis keys
 * are needed. `dailyBucket` is the leaderboard-local "day" (shifted by
 * `Leaderboard.resetTime`); when it differs from the current bucket the
 * counters restart, so no reset cron exists.
 *
 * `referrerContactId` is stamped once, on INSERT, from the unsigned
 * `lb_<leaderboardId>_<contactId>` ref — same trust model as
 * `MinigameContact.referrerContactId`.
 */
export const leaderboardParticipantModel = pgTable(
  "LeaderboardParticipant",
  {
    leaderboardId: bigintAsString()
      .notNull()
      .references(() => leaderboardModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    score: integer().default(0).notNull(),
    isBanned: boolean().default(false).notNull(),
    referrerContactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    scoredAt: timestamp(timestampConfig).defaultNow().notNull(),
    dailyBucket: date({ mode: "string" }),
    dailyCounts: jsonb().$type<LeaderboardDailyCounts>().notNull(),
    breakdown: jsonb().$type<LeaderboardBreakdown>().notNull(),
    lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leaderboardId, table.contactId] }),
    index("LeaderboardParticipant_ranking_idx")
      .using(
        "btree",
        table.leaderboardId.asc().nullsLast(),
        table.score.desc().nullsLast(),
        table.scoredAt.asc().nullsLast(),
      )
      .where(sql`NOT "isBanned"`),
    index("LeaderboardParticipant_leaderboardId_referrerContactId_idx").using(
      "btree",
      table.leaderboardId.asc().nullsLast(),
      table.referrerContactId.asc().nullsLast(),
    ),
    index("LeaderboardParticipant_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    index("LeaderboardParticipant_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("LeaderboardParticipant_referrerContactId_idx")
      .using("btree", table.referrerContactId.asc().nullsLast())
      .where(sql`${table.referrerContactId} IS NOT NULL`),
  ],
)
