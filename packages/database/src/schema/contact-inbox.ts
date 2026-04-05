import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

export const contactInboxModel = pgTable(
  "ContactInbox",
  {
    ...sharedColumns,
    originalContactId: text().notNull(),
    contactId: text().notNull(),
    inboxId: text().notNull(),
    channel: text().notNull(),
    source: text().notNull(),
    sourceId: text().notNull(),
    lastMessageAt: timestamp(timestampConfig),
    lastIncomingMessageAt: timestamp(timestampConfig),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.inboxId],
      name: "ContactInbox_pkey",
    }),
    uniqueIndex("ContactInbox_channel_sourceId_key").using(
      "btree",
      table.channel.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
