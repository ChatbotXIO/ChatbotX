import { index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const integrationModel = pgTable(
  "Integration",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationType: text().notNull(),
  },
  (table) => [
    index("Integration_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Integration_workspaceId_integrationType_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.integrationType.asc().nullsLast(),
    ),
  ],
)
