import { pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const savedReplyModel = pgTable("SavedReply", {
  ...sharedColumns,
  shortcut: text().notNull(),
  text: text().notNull(),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
