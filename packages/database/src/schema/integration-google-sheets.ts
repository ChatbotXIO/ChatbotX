import { jsonb, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const integrationGoogleSheetsModel = pgTable(
  "IntegrationGoogleSheet",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: bigintAsString()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    auth: jsonb().notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationGoogleSheet_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)
