import { sql } from "drizzle-orm"
import {
  index,
  integer,
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
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { emailTopicModel } from "./email-topic"
import { workspaceModel } from "./workspace"

export const analyticsEmailTopicModel = pgTable(
  "AnalyticsEmailTopic",
  {
    ...sharedColumns,
    // Nullable with SET NULL so deleting a topic keeps the tracking token and
    // its history; `topicReferenceId` keeps the original topic for activity.
    topicId: bigintAsString().references(() => emailTopicModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Snapshot of the topic id at creation. No FK on purpose: it must survive
    // the topic's deletion so opens/clicks still record under that topic.
    topicReferenceId: bigintAsString(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    conversationId: bigintAsString().references(() => conversationModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    email: text().notNull(),
    token: text().notNull(),
    deliveredAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    firstSeenAt: timestamp(timestampConfig),
    lastSeenAt: timestamp(timestampConfig),
    seenCount: integer().default(0).notNull(),
    firstClickedAt: timestamp(timestampConfig),
    lastClickedAt: timestamp(timestampConfig),
    clickCount: integer().default(0).notNull(),
  },
  (table) => [
    uniqueIndex("AnalyticsEmailTopic_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
    index("AnalyticsEmailTopic_topicId_idx").using(
      "btree",
      table.topicId.asc().nullsLast(),
    ),
    index("AnalyticsEmailTopic_workspaceId_topicId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.topicId.asc().nullsLast(),
    ),
    index("AnalyticsEmailTopic_contactId_idx")
      .on(table.contactId)
      .where(sql`${table.contactId} IS NOT NULL`),
    index("AnalyticsEmailTopic_conversationId_idx")
      .on(table.conversationId)
      .where(sql`${table.conversationId} IS NOT NULL`),
    index("AnalyticsEmailTopic_contactInboxId_idx")
      .on(table.contactInboxId)
      .where(sql`${table.contactInboxId} IS NOT NULL`),
  ],
)
