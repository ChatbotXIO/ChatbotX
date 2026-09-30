import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { channelPostIntegrationTypes } from "../partials/contact"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const channelPostIntegrationType = pgEnum(
  "channelPostIntegrationType",
  channelPostIntegrationTypes.options as [string, ...string[]],
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
    integrationType: channelPostIntegrationType().notNull(),
    // The id belongs to IntegrationMessenger or IntegrationInstagram according
    // to integrationType. It has no FK because those two tables are mutually
    // exclusive targets and their rows are deleted when a channel disconnects.
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
    uniqueIndex("ChannelPost_workspaceId_externalPostId_key").on(
      table.workspaceId,
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
