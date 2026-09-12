import { sql } from "drizzle-orm"
import { doublePrecision, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const aiAssistantModel = pgTable("AIAssistant", {
  ...sharedColumns,
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text().notNull(),
  prompt: text().notNull(),
  model: text().notNull(),
  attachmentIds: text().array().notNull().default(sql`[]`),
  temperature: doublePrecision().notNull(),
})
