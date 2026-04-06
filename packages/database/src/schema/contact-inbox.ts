import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"

export const contactInboxModel = pgTable(
  "ContactInbox",
  {
    ...sharedColumns,
    originalContactId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    inboxId: bigintAsString().notNull(),
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
