import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const flowModel = pgTable("Flow", {
  ...sharedColumns,
  name: text().notNull(),
  active: boolean().default(true).notNull(),
  enableInInbox: boolean().default(true).notNull(),
  currentVersionId: bigintAsString(),
  draftVersionId: bigintAsString(),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  folderId: bigintAsString().references(() => folderModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
})
