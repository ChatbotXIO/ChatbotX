import { sql } from "drizzle-orm"
import { jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export const aiTriggerModel = pgTable("AITrigger", {
  ...sharedColumns,
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text().notNull(),
  description: text(),
  flowId: bigintAsString().references(() => flowModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  questions: jsonb().array().notNull().default(sql`[]`),
  finalMessage: text(),
})
