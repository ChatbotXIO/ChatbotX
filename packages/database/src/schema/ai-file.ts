import { integer, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const aiFileModel = pgTable("AIFile", {
  ...sharedColumns,
  name: text().notNull(),
  path: text().notNull(),
  size: integer().notNull(),
  mimeType: text().notNull(),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
