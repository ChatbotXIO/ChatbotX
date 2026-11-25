import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
  type SocialContentType,
  type SocialMediaKind,
  type SocialPostCreatedVia,
  type SocialPostPartKind,
  type SocialPostPartStatus,
  type SocialPostScheduleMode,
  type SocialPostStatus,
  type SocialPostTargetStatus,
  socialContentTypes,
  socialMediaKinds,
  socialPostCreatedVia,
  socialPostPartKinds,
  socialPostPartStatuses,
  socialPostScheduleModes,
  socialPostStatuses,
  socialPostTargetStatuses,
} from "../partials/social-post"
import { userModel } from "./auth-user"
import { channelPostModel } from "./channel-post"
import { mediaLibraryFileModel } from "./media-library-file"
import { postTopicModel } from "./post-topic"
import { publishDestinationModel } from "./publish-destination"
import { socialProvider } from "./social-account"
import { workspaceModel } from "./workspace"

export const socialPostStatus = pgEnum(
  "socialPostStatus",
  socialPostStatuses.options as [SocialPostStatus, ...SocialPostStatus[]],
)
export const socialPostTargetStatus = pgEnum(
  "socialPostTargetStatus",
  socialPostTargetStatuses.options as [
    SocialPostTargetStatus,
    ...SocialPostTargetStatus[],
  ],
)
export const socialPostPartKind = pgEnum(
  "socialPostPartKind",
  socialPostPartKinds.options as [SocialPostPartKind, ...SocialPostPartKind[]],
)
export const socialPostPartStatus = pgEnum(
  "socialPostPartStatus",
  socialPostPartStatuses.options as [
    SocialPostPartStatus,
    ...SocialPostPartStatus[],
  ],
)
export const socialPostScheduleMode = pgEnum(
  "socialPostScheduleMode",
  socialPostScheduleModes.options as [
    SocialPostScheduleMode,
    ...SocialPostScheduleMode[],
  ],
)
export const socialPostCreatedViaType = pgEnum(
  "socialPostCreatedVia",
  socialPostCreatedVia.options as [
    SocialPostCreatedVia,
    ...SocialPostCreatedVia[],
  ],
)
export const socialContentType = pgEnum(
  "socialContentType",
  socialContentTypes.options as [SocialContentType, ...SocialContentType[]],
)
export const socialMediaKind = pgEnum(
  "socialMediaKind",
  socialMediaKinds.options as [SocialMediaKind, ...SocialMediaKind[]],
)

/**
 * A post composed in ChatbotX for one or more destinations. It is not
 * `ChannelPost` (a post that exists on an inbox channel): once published, a
 * target links to the `ChannelPost` of the same post when exactly one inbox
 * matches.
 */
export const socialPostModel = pgTable(
  "SocialPost",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    text: text(),
    linkUrl: text(),
    status: socialPostStatus().notNull().default("draft"),
    createdById: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdVia: socialPostCreatedViaType().notNull().default("ui"),
    // A caller-chosen key that makes creating the post safe to repeat. The hash
    // is of the normalised request: the same key with a different request is a
    // conflict, not a replay.
    idempotencyKey: text(),
    idempotencyRequestHash: text(),
    completedAt: timestamp(timestampConfig),
    // Recurring posts (a later stage): the template post an occurrence came from.
    parentSocialPostId: bigintAsString().references(
      (): AnyPgColumn => socialPostModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    occurrenceAt: timestamp(timestampConfig),
  },
  (table) => [
    // The list order: newest first, keyset on (createdAt, id).
    index("SocialPost_workspaceId_createdAt_id_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
      table.id.desc().nullsLast(),
    ),
    index("SocialPost_workspaceId_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    uniqueIndex("SocialPost_workspaceId_idempotencyKey_key")
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("SocialPost_createdById_idx")
      .on(table.createdById)
      .where(sql`${table.createdById} IS NOT NULL`),
    index("SocialPost_parentSocialPostId_idx")
      .on(table.parentSocialPostId)
      .where(sql`${table.parentSocialPostId} IS NOT NULL`),
    uniqueIndex("SocialPost_parentSocialPostId_occurrenceAt_key")
      .on(table.parentSocialPostId, table.occurrenceAt)
      .where(sql`${table.parentSocialPostId} IS NOT NULL`),
  ],
)

/** One destination of a post: its own schedule, content overrides and publish result. */
export const socialPostTargetModel = pgTable(
  "SocialPostTarget",
  {
    ...sharedColumns,
    socialPostId: bigintAsString()
      .notNull()
      .references(() => socialPostModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // RESTRICT: a destination with targets cannot be deleted. Workspace purge
    // drains the targets first (`HEAVY_WORKSPACE_TABLES`).
    publishDestinationId: bigintAsString()
      .notNull()
      .references(() => publishDestinationModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    provider: socialProvider().notNull(),
    contentType: socialContentType().notNull(),
    textOverride: text(),
    // `false`: the target uses the post's shared media. `true` with no rows of
    // its own: deliberately no media.
    overridesMedia: boolean().notNull().default(false),
    options: jsonb()
      .$type<Record<string, boolean | string | number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: socialPostTargetStatus().notNull().default("pending"),
    scheduleMode: socialPostScheduleMode().notNull().default("custom"),
    // The time the person asked for; `nextAttemptAt` is the pipeline's clock.
    // Every schedule operation writes both in one statement.
    scheduledAt: timestamp(timestampConfig),
    timezone: text(),
    queueSlotAt: timestamp(timestampConfig),
    nextAttemptAt: timestamp(timestampConfig),
    leaseExpiresAt: timestamp(timestampConfig),
    attemptCount: integer().notNull().default(0),
    // Rate-limit retries used, a budget apart from `attemptCount` (network
    // errors): a limit answer waits 1 h, 2 h, 4 h and does not spend an attempt.
    rateLimitAttempts: integer().notNull().default(0),
    publishStartedAt: timestamp(timestampConfig),
    // Provider-side identity of an in-flight publish (e.g. a container id).
    continuation: jsonb().$type<Record<string, string | number | boolean>>(),
    errorCategory: text(),
    errorCode: text(),
    errorMessage: text(),
    externalPostId: text(),
    permalink: text(),
    publishedAt: timestamp(timestampConfig),
    // Set when the post was taken down from the network (`removeFromChannels`).
    // The target stays `published`: it is history of what was published.
    removedAt: timestamp(timestampConfig),
    channelPostId: bigintAsString().references(() => channelPostModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Message-quota charge of a published target (1 message per destination,
    // parts included). Set in the same UPDATE that settles `published`; the
    // charge claims it (`quotaChargePending` -> false, `quotaChargedAt` set) and
    // a failed charge sets it back so the recovery sweep retries. Never both.
    quotaChargePending: boolean().notNull().default(false),
    quotaChargedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("SocialPostTarget_socialPostId_destination_key").on(
      table.socialPostId,
      table.publishDestinationId,
    ),
    index("SocialPostTarget_workspaceId_idx").on(table.workspaceId),
    index("SocialPostTarget_publishDestinationId_idx").on(
      table.publishDestinationId,
    ),
    // The scanners' predicates (stage 9 and 10 use them).
    index("SocialPostTarget_due_idx")
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("SocialPostTarget_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.status} IN ('publishing', 'processing')`),
    // The queue: one target per destination per slot. The advisory lock keeps
    // callers from racing; this index makes a path that forgot it fail instead
    // of double-booking. Cleared when the target stops waiting for its slot.
    uniqueIndex("SocialPostTarget_destination_queueSlotAt_key")
      .on(table.publishDestinationId, table.queueSlotAt)
      .where(sql`${table.queueSlotAt} IS NOT NULL`),
    // The calendar: targets of a workspace by their scheduled time.
    index("SocialPostTarget_workspaceId_scheduledAt_idx")
      .on(table.workspaceId, table.scheduledAt)
      .where(sql`${table.scheduledAt} IS NOT NULL`),
    index("SocialPostTarget_channelPostId_idx")
      .on(table.channelPostId)
      .where(sql`${table.channelPostId} IS NOT NULL`),
    // The recovery sweep of unsettled quota charges (tiny: only crashed or
    // failed charges stay in it).
    index("SocialPostTarget_quotaChargePending_idx")
      .on(table.id)
      .where(sql`${table.quotaChargePending}`),
  ],
)

/**
 * A follow-up of a target, published after its head post: a thread reply
 * chained to the previous post, or the first comment. Positions run 1..N (the
 * head is the target itself); the first comment is always the last. Each part
 * has its own claim (`leaseExpiresAt` is the fence), marker (`publishStartedAt`)
 * and provider-side identity (`continuation`), so a crash is judged per part.
 */
export const socialPostTargetPartModel = pgTable(
  "SocialPostTargetPart",
  {
    ...sharedColumns,
    socialPostTargetId: bigintAsString()
      .notNull()
      .references(() => socialPostTargetModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer().notNull(),
    kind: socialPostPartKind().notNull().default("threadPart"),
    text: text().notNull(),
    status: socialPostPartStatus().notNull().default("pending"),
    nextAttemptAt: timestamp(timestampConfig),
    leaseExpiresAt: timestamp(timestampConfig),
    attemptCount: integer().notNull().default(0),
    rateLimitAttempts: integer().notNull().default(0),
    publishStartedAt: timestamp(timestampConfig),
    continuation: jsonb().$type<Record<string, string | number | boolean>>(),
    errorCategory: text(),
    errorCode: text(),
    errorMessage: text(),
    externalPostId: text(),
    permalink: text(),
    publishedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("SocialPostTargetPart_socialPostTargetId_position_key").on(
      table.socialPostTargetId,
      table.position,
    ),
    // At most one first comment per target.
    uniqueIndex("SocialPostTargetPart_firstComment_key")
      .on(table.socialPostTargetId)
      .where(sql`${table.kind} = 'firstComment'`),
    index("SocialPostTargetPart_workspaceId_idx").on(table.workspaceId),
    // The scanners' predicates (due retries, expired leases).
    index("SocialPostTargetPart_due_idx")
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("SocialPostTargetPart_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.status} IN ('publishing', 'processing')`),
  ],
)

const mediaColumns = {
  altText: text(),
  durationMs: integer(),
  height: integer(),
  kind: socialMediaKind().notNull(),
  mediaLibraryFileId: bigintAsString().references(
    () => mediaLibraryFileModel.id,
    { onDelete: "set null", onUpdate: "cascade" },
  ),
  mimeType: text().notNull(),
  path: text().notNull(),
  position: integer().notNull(),
  size: integer().notNull(),
  width: integer(),
}

/** A file shared by every target of a post that does not override its media. */
export const socialPostMediaModel = pgTable(
  "SocialPostMedia",
  {
    ...sharedColumns,
    socialPostId: bigintAsString()
      .notNull()
      .references(() => socialPostModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...mediaColumns,
  },
  (table) => [
    uniqueIndex("SocialPostMedia_socialPostId_position_key").on(
      table.socialPostId,
      table.position,
    ),
    index("SocialPostMedia_workspaceId_idx").on(table.workspaceId),
    index("SocialPostMedia_mediaLibraryFileId_idx")
      .on(table.mediaLibraryFileId)
      .where(sql`${table.mediaLibraryFileId} IS NOT NULL`),
  ],
)

/** A file of one target that overrides the post's shared media. */
export const socialPostTargetMediaModel = pgTable(
  "SocialPostTargetMedia",
  {
    ...sharedColumns,
    socialPostTargetId: bigintAsString()
      .notNull()
      .references(() => socialPostTargetModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...mediaColumns,
  },
  (table) => [
    uniqueIndex("SocialPostTargetMedia_socialPostTargetId_position_key").on(
      table.socialPostTargetId,
      table.position,
    ),
    index("SocialPostTargetMedia_workspaceId_idx").on(table.workspaceId),
    index("SocialPostTargetMedia_mediaLibraryFileId_idx")
      .on(table.mediaLibraryFileId)
      .where(sql`${table.mediaLibraryFileId} IS NOT NULL`),
  ],
)

export const socialPostToPostTopicModel = pgTable(
  "SocialPostToPostTopic",
  {
    socialPostId: bigintAsString()
      .notNull()
      .references(() => socialPostModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    postTopicId: bigintAsString()
      .notNull()
      .references(() => postTopicModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.socialPostId, table.postTopicId] }),
    index("SocialPostToPostTopic_postTopicId_idx").on(table.postTopicId),
  ],
)
