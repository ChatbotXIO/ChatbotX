import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { LeaderboardAuditAction } from "../partials/leaderboard"
import { leaderboardAuditActions } from "../partials/leaderboard"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { leaderboardModel } from "./leaderboard"
import { workspaceModel } from "./workspace"

export const leaderboardAuditAction = pgEnum(
  "leaderboardAuditAction",
  leaderboardAuditActions.options as [
    LeaderboardAuditAction,
    ...LeaderboardAuditAction[],
  ],
)

/**
 * Immutable log of admin interventions (manual adjust, reset, ban/unban).
 * Kept separate from the partitioned `LeaderboardScoreEvent` because that
 * table drops whole months past retention — this one is small and kept
 * forever. Never updated; rows are only inserted.
 */
export const leaderboardAuditLogModel = pgTable(
  "LeaderboardAuditLog",
  {
    id: sharedColumns.id,
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    leaderboardId: bigintAsString()
      .notNull()
      .references(() => leaderboardModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // null for leaderboard-wide actions (resetAll).
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: leaderboardAuditAction().notNull(),
    delta: integer().default(0).notNull(),
    actorUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    reason: text().default("").notNull(),
  },
  (table) => [
    index("LeaderboardAuditLog_leaderboardId_createdAt_idx").using(
      "btree",
      table.leaderboardId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("LeaderboardAuditLog_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
