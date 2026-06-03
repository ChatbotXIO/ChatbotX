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
    topicId: bigintAsString()
      .notNull()
      .references(() => emailTopicModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
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
  ],
)
