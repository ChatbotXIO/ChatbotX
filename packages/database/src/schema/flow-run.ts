import { index, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { conversationModel } from "./conversation"
import { flowModel } from "./flow"
import { flowVersionModel } from "./flow-version"
import { workspaceModel } from "./workspace"

export const flowRunModel = pgTable(
  "FlowRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowVersionId: bigintAsString()
      .notNull()
      .references(() => flowVersionModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString().references(() => conversationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("FlowRun_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    index("FlowRun_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("FlowRun_flowId_idx").using("btree", table.flowId.asc().nullsLast()),
    index("FlowRun_flowVersionId_idx").using(
      "btree",
      table.flowVersionId.asc().nullsLast(),
    ),
  ],
)
