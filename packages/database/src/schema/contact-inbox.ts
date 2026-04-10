import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { inboxModel } from "./inbox"

export const contactInboxModel = pgTable(
  "ContactInbox",
  {
    ...sharedColumns,
    originalContactId: bigintAsString().notNull(),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: text().notNull(),
    source: text().notNull(),
    sourceId: text().notNull(),
    lastMessageAt: timestamp(timestampConfig),
    lastIncomingMessageAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("ContactInbox_channel_sourceId_key").using(
      "btree",
      table.channel.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
