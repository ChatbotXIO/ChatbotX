import { pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"

export const savedReplyModel = pgTable("SavedReply", {
  ...sharedColumns,
  shortcut: text().notNull(),
  text: text().notNull(),
  userId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
