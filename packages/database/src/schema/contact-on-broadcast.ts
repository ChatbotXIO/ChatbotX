import { boolean, pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { contactModel } from "./contact"

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
    sent: boolean().default(false).notNull(),
    delivered: boolean().default(false).notNull(),
    seen: boolean().default(false).notNull(),
    clicked: boolean().default(false).notNull(),
    failed: boolean().default(false).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.contactId],
      name: "ContactsOnBroadcast_pkey",
    }),
  ],
)
