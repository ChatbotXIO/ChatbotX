import { type SQL, sql } from "drizzle-orm"
import { boolean, index, pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"

export const contactsOnBroadcastsModel = pgTable(
  "ContactOnBroadcast",
  {
    broadcastId: bigintAsString()
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sent: boolean().default(false).notNull(),
    delivered: boolean().default(false).notNull(),
    seen: boolean().default(false).notNull(),
    clicked: boolean().default(false).notNull(),
    failed: boolean().default(false).notNull(),
    sentAt: bigintAsString(),
    readAt: bigintAsString(),
    isRead: boolean().generatedAlwaysAs(
      (): SQL =>
        sql`case when "sentAt" is null then false when "readAt" is null then false else "readAt" >= "sentAt" end`,
    ),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.contactId],
      name: "ContactsOnBroadcast_pkey",
    }),
    index("idx_contact_on_broadcast_contact_id").on(table.contactId),
    index("idx_contact_on_broadcast_is_read").on(table.isRead),
  ],
)
