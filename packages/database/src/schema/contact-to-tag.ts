import { pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { contactModel } from "./contact"
import { tagModel } from "./tag"

export const contactsToTagsModel = pgTable(
  "ContactToTag",
  {
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tagId: bigintAsString()
      .notNull()
      .references(() => tagModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.tagId],
    }),
  ],
)
