import { sql } from "drizzle-orm"
import {
  boolean,
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
  type SocialPostFeedFilters,
  type SocialPostFeedItemOutcome,
  type SocialPostFeedMediaMode,
  type SocialPostFeedMode,
  type SocialPostFeedNoImageFallback,
  type SocialPostFeedPostAs,
  type SocialPostFeedRunSummary,
  type SocialPostFeedStatus,
  type SocialPostFeedTemplateSyntax,
  type SocialPostFeedTemplatesByProvider,
  socialPostFeedItemOutcomes,
  socialPostFeedMediaModes,
  socialPostFeedModes,
  socialPostFeedNoImageFallbacks,
  socialPostFeedPostAs,
  socialPostFeedStatuses,
  socialPostFeedTemplateSyntaxes,
} from "../partials/social-post-feed"
import { userModel } from "./auth-user"
import { publishDestinationModel } from "./publish-destination"
import { socialPostModel } from "./social-post"
import { socialPostSnippetModel } from "./social-post-snippet"
import { workspaceModel } from "./workspace"

export const socialPostFeedStatus = pgEnum(
  "socialPostFeedStatus",
  socialPostFeedStatuses.options as [
    SocialPostFeedStatus,
    ...SocialPostFeedStatus[],
  ],
)

export const socialPostFeedMode = pgEnum(
  "socialPostFeedMode",
  socialPostFeedModes.options as [SocialPostFeedMode, ...SocialPostFeedMode[]],
)

export const socialPostFeedItemOutcome = pgEnum(
  "socialPostFeedItemOutcome",
  socialPostFeedItemOutcomes.options as [
    SocialPostFeedItemOutcome,
    ...SocialPostFeedItemOutcome[],
  ],
)

export const socialPostFeedTemplateSyntax = pgEnum(
  "socialPostFeedTemplateSyntax",
  socialPostFeedTemplateSyntaxes.options as [
    SocialPostFeedTemplateSyntax,
    ...SocialPostFeedTemplateSyntax[],
  ],
)

export const socialPostFeedMediaMode = pgEnum(
  "socialPostFeedMediaMode",
  socialPostFeedMediaModes.options as [
    SocialPostFeedMediaMode,
    ...SocialPostFeedMediaMode[],
  ],
)

export const socialPostFeedPostAsEnum = pgEnum(
  "socialPostFeedPostAs",
  socialPostFeedPostAs.options as [
    SocialPostFeedPostAs,
    ...SocialPostFeedPostAs[],
  ],
)

export const socialPostFeedNoImageFallback = pgEnum(
  "socialPostFeedNoImageFallback",
  socialPostFeedNoImageFallbacks.options as [
    SocialPostFeedNoImageFallback,
    ...SocialPostFeedNoImageFallback[],
  ],
)

/**
 * An RSS/Atom feed a workspace watches: every check turns the items it has not
 * seen into posts (drafts, or queued) for the feed's destinations. Not copied
 * by templates (an external URL and external accounts).
 */
export const socialPostFeedModel = pgTable(
  "SocialPostFeed",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    feedUrl: text().notNull(),
    status: socialPostFeedStatus().notNull().default("active"),
    intervalMinutes: integer().notNull().default(60),
    /** The next check is due at or after this instant; a claim pushes it forward. */
    nextCheckAt: timestamp(timestampConfig).notNull().defaultNow(),
    /** A claimed check is owned until this instant; another worker may take over after it. */
    leaseExpiresAt: timestamp(timestampConfig),
    lastCheckedAt: timestamp(timestampConfig),
    /** Set by "run now"; the next manual run must wait. */
    lastManualCheckAt: timestamp(timestampConfig),
    /** Validators of the last good response, for a conditional GET. */
    etag: text(),
    lastModified: text(),
    consecutiveFailures: integer().notNull().default(0),
    lastErrorCode: text(),
    /** The post text; its language is `templateSyntax` (`{title}` for `legacy`, `{{ title }}` for `v2`). */
    textTemplate: text().notNull().default("{{ title }}\n{{ link }}"),
    /** The language of `textTemplate`: new feeds are `v2`; `legacy` stays accepted by the API and renders the `{title}` replacement. */
    templateSyntax: socialPostFeedTemplateSyntax().notNull().default("v2"),
    /** Text per network instead of `textTemplate` (v2 syntax only); `{}` = every network uses the shared text. */
    templatesByProvider: jsonb()
      .$type<SocialPostFeedTemplatesByProvider>()
      .notNull()
      .default({}),
    /** An item with no usable picture gets its article page's og:image / twitter:image (fetched once, within budgets). */
    fetchArticleImage: boolean().notNull().default(false),
    /** What the last check did (counts, or that the source returned an older copy); null until the first check. */
    lastRunSummary: jsonb().$type<SocialPostFeedRunSummary>(),
    /** Where post pictures come from; `none` attaches no picture (the service creates new feeds with `auto`). */
    mediaMode: socialPostFeedMediaMode().notNull().default("none"),
    /** `mediaMode` = `field`: a template (same language) that yields the picture address. */
    mediaField: text(),
    /** Media Library files used when the item has no picture of its own (picked by item, in order). */
    mediaLibraryFileIds: jsonb().$type<string[]>().default([]).notNull(),
    /** The shape of the post: with its picture, a link preview, or text only. */
    postAs: socialPostFeedPostAsEnum().notNull().default("text"),
    /** What an item without a usable picture becomes when `postAs` is `photo`. */
    noImageFallback: socialPostFeedNoImageFallback().notNull().default("text"),
    /** Which items become posts; null = all. */
    filters: jsonb().$type<SocialPostFeedFilters>(),
    signatureId: bigintAsString().references(() => socialPostSnippetModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    mode: socialPostFeedMode().notNull().default("draft"),
    maxItemsPerRun: integer().notNull().default(5),
    dailyCap: integer().notNull().default(10),
    /** Items published before this instant never become posts. */
    startedAt: timestamp(timestampConfig).notNull().defaultNow(),
    /** Set once the first check has recorded the items the feed already had. */
    primedAt: timestamp(timestampConfig),
    createdById: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Write each new item's post with the AI model below instead of the text template. */
    aiWrite: boolean().notNull().default(false),
    /** Extra wording for the writer; untrusted text, at most 300 characters. */
    aiInstructions: text(),
    /** The AI integration picked for writing; with `aiModel`, else the Inbox translation model is used. */
    aiIntegrationId: text(),
    aiModel: text(),
    /** The first check also makes a post from the newest item instead of only recording the items. */
    postLatestOnFirstCheck: boolean().notNull().default(false),
  },
  (table) => [
    // Also serves the per-workspace lookups (leading `workspaceId`).
    uniqueIndex("SocialPostFeed_workspaceId_feedUrl_key").on(
      table.workspaceId,
      table.feedUrl,
    ),
    // Serves the per-minute due scan: active feeds ordered by their next check.
    index("SocialPostFeed_due_idx")
      .on(table.nextCheckAt, table.id)
      .where(sql`${table.status} = 'active'`),
    index("SocialPostFeed_signatureId_idx")
      .on(table.signatureId)
      .where(sql`${table.signatureId} IS NOT NULL`),
    index("SocialPostFeed_createdById_idx")
      .on(table.createdById)
      .where(sql`${table.createdById} IS NOT NULL`),
  ],
)

/** The destinations a feed's posts go to. */
export const socialPostFeedDestinationModel = pgTable(
  "SocialPostFeedDestination",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    feedId: bigintAsString()
      .notNull()
      .references(() => socialPostFeedModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    publishDestinationId: bigintAsString()
      .notNull()
      .references(() => publishDestinationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("SocialPostFeedDestination_feedId_destinationId_key").on(
      table.feedId,
      table.publishDestinationId,
    ),
    index("SocialPostFeedDestination_destinationId_idx").on(
      table.publishDestinationId,
    ),
    index("SocialPostFeedDestination_workspaceId_idx").on(table.workspaceId),
  ],
)

/**
 * The ledger of a feed: one row per item, written in the same transaction as
 * the post it creates, so an item becomes a post exactly once. Rows older than
 * the retention window are pruned; an item that old is always skipped anyway.
 */
export const socialPostFeedItemModel = pgTable(
  "SocialPostFeedItem",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    feedId: bigintAsString()
      .notNull()
      .references(() => socialPostFeedModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** The item's guid, else its link, else a hash of its title and date. */
    itemKey: text().notNull(),
    title: text(),
    link: text(),
    publishedAt: timestamp(timestampConfig),
    outcome: socialPostFeedItemOutcome().notNull(),
    /** A short code (or a comma-separated list) for a skipped item or a note on a created one. */
    reason: text(),
    /** The picture chosen for the item, when one was; the Media Library copy is what the post uses. */
    imageUrl: text(),
    /** Where `imageUrl` came from (a `SocialPostFeedImageSource`). */
    imageSource: text(),
    /** Why the picture could not be used (a `SocialPostFeedImageError`); the post still went out. */
    imageError: text(),
    /** Destinations left out of this item's post because they cannot carry its shape (no picture for Instagram, ...). */
    droppedDestinationIds: jsonb().$type<string[]>(),
    /** The post of a `created` item; kept as history when the post is deleted. */
    socialPostId: bigintAsString().references(() => socialPostModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    uniqueIndex("SocialPostFeedItem_feedId_itemKey_key").on(
      table.feedId,
      table.itemKey,
    ),
    index("SocialPostFeedItem_feedId_createdAt_idx").on(
      table.feedId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("SocialPostFeedItem_workspaceId_idx").on(table.workspaceId),
    index("SocialPostFeedItem_socialPostId_idx")
      .on(table.socialPostId)
      .where(sql`${table.socialPostId} IS NOT NULL`),
  ],
)
