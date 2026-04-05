import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { customFieldModel } from "./custom-field"

export const contactCustomFieldModel = pgTable(
  "ContactCustomField",
  {
    ...sharedColumns,
    value: text().notNull(),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customFieldId: bigintAsString()
      .notNull()
      .references(() => customFieldModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("ContactCustomField_contactId_customFieldId_key").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.customFieldId.asc().nullsLast(),
    ),
  ],
)
