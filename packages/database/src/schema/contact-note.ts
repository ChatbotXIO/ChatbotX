import { pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"

export const contactNoteModel = pgTable("ContactNote", {
  ...sharedColumns,
  text: text().notNull(),
  contactId: bigintAsString()
    .notNull()
    .references(() => contactModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  createdById: bigintAsString().references(() => userModel.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
})
