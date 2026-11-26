import type { PostingScheduleSlots } from "@chatbotx.io/utils/posting-slots"
import type { PublishPauseReason } from "@chatbotx.io/utils/publish-limits"
import { sql } from "drizzle-orm"
import {
  check,
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
  type PublishDestinationStatus,
  publishDestinationStatuses,
} from "../partials/publish-destination"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { socialAccountDestinationModel, socialProvider } from "./social-account"
import { workspaceModel } from "./workspace"

export const publishDestinationStatus = pgEnum(
  "publishDestinationStatus",
  publishDestinationStatuses.options as [
    PublishDestinationStatus,
    ...PublishDestinationStatus[],
  ],
)

/**
 * A place a workspace can publish a post to. It binds either a connected inbox
 * (Facebook Page, Instagram, Threads: published with the inbox integration's
 * own token) or a TikTok `SocialAccountDestination` (its own publishing app),
 * and is what every post target, schedule, feed and target set points at, so
 * they keep one identity whichever credential publishes. Rows are created
 * lazily and idempotently; an inbox is never hard-deleted, so a disconnected
 * inbox keeps its row and its history (the state says `inboxDisconnected`).
 */
export const publishDestinationModel = pgTable(
  "PublishDestination",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: socialProvider().notNull(),
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    socialAccountDestinationId: bigintAsString().references(
      () => socialAccountDestinationModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    // The permissions the network reported at the last connect or check; null
    // when never captured.
    grantedScopes: text().array(),
    publishStatus: publishDestinationStatus().notNull().default("ok"),
    missingScopes: text().array().notNull().default(sql`ARRAY[]::text[]`),
    // Fingerprint (sha256) of the inbox token `publishStatus` was learned with:
    // a reconnect changes the token, so a stale status never outlives it.
    statusTokenFingerprint: text(),
    checkedAt: timestamp(timestampConfig),
    // Storage path of OUR re-hosted copy of the page or profile picture (the
    // network's own URLs expire); null until fetched or when there is none.
    avatar: text(),
    // When the last fetch ran, successful or not: a failure retries after a day.
    avatarFetchedAt: timestamp(timestampConfig),
    // Publishing pace (docs/posts.md, "Publishing pace and platform limits").
    // When the last publish attempt on this destination started: the guarded
    // UPDATE that spaces two publishes reads and writes it.
    lastPublishStartedAt: timestamp(timestampConfig),
    // The circuit breaker: set after repeated account-level limit answers; due
    // targets wait until then (they are deferred, never failed).
    pausedUntil: timestamp(timestampConfig),
    pauseReason: text().$type<PublishPauseReason>(),
    // Consecutive account-level limit/restriction/spam answers; a successful
    // publish resets it. The default is a real SQL default (bare inserts).
    consecutiveLimitErrors: integer().notNull().default(0),
  },
  (table) => [
    index("PublishDestination_workspaceId_idx").on(table.workspaceId),
    uniqueIndex("PublishDestination_inboxId_key")
      .on(table.inboxId)
      .where(sql`${table.inboxId} IS NOT NULL`),
    uniqueIndex("PublishDestination_socialAccountDestinationId_key")
      .on(table.socialAccountDestinationId)
      .where(sql`${table.socialAccountDestinationId} IS NOT NULL`),
    check(
      "PublishDestination_binding_check",
      sql`num_nonnulls(${table.inboxId}, ${table.socialAccountDestinationId}) = 1`,
    ),
    check(
      "PublishDestination_tiktok_check",
      sql`(${table.provider} = 'tiktok') = (${table.socialAccountDestinationId} IS NOT NULL)`,
    ),
  ],
)

const EMPTY_POSTING_SLOTS_SQL = sql`'[{"weekday":0,"enabled":false,"times":[]},{"weekday":1,"enabled":false,"times":[]},{"weekday":2,"enabled":false,"times":[]},{"weekday":3,"enabled":false,"times":[]},{"weekday":4,"enabled":false,"times":[]},{"weekday":5,"enabled":false,"times":[]},{"weekday":6,"enabled":false,"times":[]}]'::jsonb`

/**
 * The times of the week a destination publishes at (its queue). One row per
 * destination, created when someone sets it. Times are local wall-clock times
 * in `timezone`, so a schedule keeps its clock across a daylight-saving change.
 * Every edit runs in a transaction under the destination's advisory lock.
 */
export const publishDestinationScheduleModel = pgTable(
  "PublishDestinationSchedule",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    publishDestinationId: bigintAsString()
      .notNull()
      .references(() => publishDestinationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    timezone: text().notNull().default("UTC"),
    // Seven items `{weekday, enabled, times: ["HH:mm"]}`, at most ten times a day.
    slots: jsonb()
      .$type<PostingScheduleSlots>()
      .notNull()
      .default(EMPTY_POSTING_SLOTS_SQL),
  },
  (table) => [
    uniqueIndex("PublishDestinationSchedule_destination_key").on(
      table.publishDestinationId,
    ),
    index("PublishDestinationSchedule_workspaceId_idx").on(table.workspaceId),
  ],
)
