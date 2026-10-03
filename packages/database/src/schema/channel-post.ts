import { sql } from "drizzle-orm"
import {
  index,
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
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

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
  ],
)
