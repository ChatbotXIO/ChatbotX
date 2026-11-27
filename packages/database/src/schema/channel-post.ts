import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ChannelPostContentType,
  type ChannelPostLiveStatus,
  channelPostContentTypes,
  channelPostLiveStatuses,
} from "../partials/channel-post"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const channelPostContentType = pgEnum(
  "channelPostContentType",
  channelPostContentTypes.options as [
    ChannelPostContentType,
    ...ChannelPostContentType[],
  ],
)
export const channelPostLiveStatus = pgEnum(
  "channelPostLiveStatus",
  channelPostLiveStatuses.options as [
    ChannelPostLiveStatus,
    ...ChannelPostLiveStatus[],
  ],
)

export const channelPostModel = pgTable(
  "ChannelPost",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // The channel the post belongs to (a ChannelType, same value as
    // Inbox.channel). Plain text so a new channel needs no DDL; it namespaces
    // the external id because providers reuse bare numeric ids.
    channel: text().notNull(),
    // The id of the channel's integration row (whichever table that channel
    // uses). No FK: those rows are deleted when a channel disconnects.
    integrationId: bigintAsString().notNull(),
    sourceAccountId: text().notNull(),
    externalPostId: text().notNull(),
    caption: text(),
    mediaType: text(),
    thumbnail: text(),
    permalink: text(),
    publishedAt: timestamp(timestampConfig),
    metadataFetchedAt: timestamp(timestampConfig),
    metadataAttemptedAt: timestamp(timestampConfig),
    contentType: channelPostContentType(),
    liveStatus: channelPostLiveStatus(),
    // When `liveStatus` was last observed from a live signal (webhook, comment,
    // a listing or a re-read). An older observation never overwrites a newer one.
    liveStatusObservedAt: timestamp(timestampConfig),
    // When a live broadcast is read again (a missed end event must still end
    // it); NULL once it is over or given up. The minute scan claims due rows by
    // moving this forward, so a failing row cannot starve the others.
    liveRecheckAt: timestamp(timestampConfig),
    // Counts reported by the platform; `engagementCount` is their sum. bigint:
    // a view count can pass 2^31. A count the platform never reported is stored
    // as 0, so `metricsKnownMask` records which ones were really reported.
    commentsCount: bigint({ mode: "number" }).notNull().default(0),
    reactionsCount: bigint({ mode: "number" }).notNull().default(0),
    sharesCount: bigint({ mode: "number" }).notNull().default(0),
    engagementCount: bigint({ mode: "number" }).notNull().default(0),
    // Which of comments (1), reactions (2) and shares (4) a listing ever
    // reported for this post; views are known when `viewsCount` is not null.
    // 0 until the first listing that carries a count.
    metricsKnownMask: integer().notNull().default(0),
    // Counted by us, as comments that carry a phone number arrive.
    phoneCommentsCount: integer().notNull().default(0),
    viewsCount: bigint({ mode: "number" }),
    metricsFetchedAt: timestamp(timestampConfig),
    // Per-post comment settings, applied to every new comment of the post.
    hideComments: boolean().notNull().default(false),
    hidePhoneComments: boolean().notNull().default(false),
    skipComments: boolean().notNull().default(false),
    authorName: text(),
    authorExternalId: text(),
    // Set only after the platform confirmed this one post is gone.
    removedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("ChannelPost_workspaceId_channel_externalPostId_key").on(
      table.workspaceId,
      table.channel,
      table.externalPostId,
    ),
    index("ChannelPost_workspaceId_sortAt_id_idx").on(
      table.workspaceId,
      sql`COALESCE(${table.publishedAt}, ${table.createdAt}) DESC`,
      table.id.desc(),
    ),
    index("ChannelPost_inboxId_idx").on(table.inboxId),
    // One index per count sort so each order is served with no Sort node; the
    // "fewest" variants scan the same index backwards.
    index("ChannelPost_workspaceId_commentsCount_id_idx").on(
      table.workspaceId,
      table.commentsCount.desc(),
      table.id.desc(),
    ),
    index("ChannelPost_workspaceId_phoneCommentsCount_id_idx").on(
      table.workspaceId,
      table.phoneCommentsCount.desc(),
      table.id.desc(),
    ),
    index("ChannelPost_workspaceId_engagementCount_id_idx").on(
      table.workspaceId,
      table.engagementCount.desc(),
      table.id.desc(),
    ),
    index("ChannelPost_workspaceId_sharesCount_id_idx").on(
      table.workspaceId,
      table.sharesCount.desc(),
      table.id.desc(),
    ),
    // The author filter and the author picker group by the platform's author id.
    index("ChannelPost_workspaceId_authorExternalId_idx")
      .on(table.workspaceId, table.authorExternalId)
      .where(sql`${table.authorExternalId} IS NOT NULL`),
    // The live filters ("live now" / "past live") read only rows that have a
    // live status, in the default list order (sortAt DESC, id DESC).
    index("ChannelPost_workspaceId_liveStatus_sortAt_id_idx")
      .on(
        table.workspaceId,
        table.liveStatus,
        sql`COALESCE(${table.publishedAt}, ${table.createdAt}) DESC`,
        table.id.desc(),
      )
      .where(sql`${table.liveStatus} IS NOT NULL`),
    // The scan claims the live broadcasts that are due, oldest first.
    index("ChannelPost_liveRecheckAt_id_idx")
      .on(table.liveRecheckAt, table.id)
      .where(
        sql`${table.liveStatus} = 'live' AND ${table.liveRecheckAt} IS NOT NULL`,
      ),
  ],
)
