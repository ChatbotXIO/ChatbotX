import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationZaloModel = pgTable(
  "IntegrationZalo",
  {
    ...sharedColumns,
    auth: jsonb().$type<{ [x: string]: unknown }>().notNull(),
    oaId: text().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fallbackFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("IntegrationZalo_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("IntegrationZalo_fallbackFlowId_idx").using(
      "btree",
      table.fallbackFlowId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationZalo_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
  ],
)
