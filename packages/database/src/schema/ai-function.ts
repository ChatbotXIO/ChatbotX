import { jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export const aiFunctionModel = pgTable("AIFunction", {
  ...sharedColumns,
  name: text().notNull(),
  purpose: text(),
  dataCollect: jsonb(),
  outputMessage: text(),
  triggerFlowId: bigintAsString().references(() => flowModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
