import { pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const errorLogModel = pgTable("ErrorLog", {
  ...sharedColumns,
  action: text().notNull(),
  detail: text().notNull(),
  httpCode: text(),
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
})
