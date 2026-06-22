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
    contactLastReadAt: timestamp(timestampConfig),
    lastMessageAt: timestamp(timestampConfig),
    lastIncomingMessageAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("ContactInbox_inboxId_sourceId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("ContactInbox_contactId_lastIncomingMessageAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.lastIncomingMessageAt.asc().nullsLast(),
    ),
  ],
)
