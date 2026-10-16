import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type {
  LeaderboardPlatform,
  LeaderboardRewardRecipients,
  LeaderboardRewardSettings,
  LeaderboardRules,
  LeaderboardScope,
  LeaderboardStatus,
} from "../partials/leaderboard"
import {
  leaderboardPlatforms,
  leaderboardStatuses,
} from "../partials/leaderboard"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { minigameModel } from "./minigame"
import { workspaceModel } from "./workspace"

export const leaderboardStatus = pgEnum(
  "leaderboardStatus",
  leaderboardStatuses.options as [LeaderboardStatus, ...LeaderboardStatus[]],
)

export const leaderboardPlatform = pgEnum(
  "leaderboardPlatform",
  leaderboardPlatforms.options as [
    LeaderboardPlatform,
    ...LeaderboardPlatform[],
  ],
)

/**
 * A ranking campaign on one platform. Deliberately carries no participant or
 * point counters: every award would update this single row and serialize a
 * livestream burst behind its lock. Live counters live in Redis
 * (`lb:{id}:stats`, see `packages/redis/src/leaderboard-store.ts`).
 *
 * Every jsonb column has no DB default — insert paths must write them
 * explicitly (see AGENTS.md on `.default()`).
 */
export const leaderboardModel = pgTable(
  "Leaderboard",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    description: text().default("").notNull(),
    coverImageUrl: text().default("").notNull(),
    startsAt: timestamp(timestampConfig).notNull(),
    endsAt: timestamp(timestampConfig).notNull(),
    status: leaderboardStatus().default("draft").notNull(),
    platform: leaderboardPlatform().notNull(),
    // The host channel for every platform except `gamification`, which is
    // scored from `minigameId` instead.
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    minigameId: bigintAsString().references(() => minigameModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    scope: jsonb().$type<LeaderboardScope>().notNull(),
    rules: jsonb().$type<LeaderboardRules>().notNull(),
    followersOnly: boolean().default(false).notNull(),
    tagIds: jsonb().$type<string[]>().notNull(),
    // "HH:mm" UTC — when per-contact daily rule counters restart.
    resetTime: text().default("22:00").notNull(),
    cooldownSeconds: integer().default(0).notNull(),
    referralWelcomeFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    rewardSettings: jsonb().$type<LeaderboardRewardSettings>().notNull(),
    rewardsTriggeredAt: timestamp(timestampConfig),
    // Who already got (or is getting) the reward flow — see
    // `LeaderboardRewardDelivery`. Null until rewards are first triggered.
    rewardRecipients: jsonb().$type<LeaderboardRewardRecipients>(),
    finishedAt: timestamp(timestampConfig),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Leaderboard_workspaceId_status_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("Leaderboard_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    index("Leaderboard_minigameId_idx").using(
      "btree",
      table.minigameId.asc().nullsLast(),
    ),
  ],
)
