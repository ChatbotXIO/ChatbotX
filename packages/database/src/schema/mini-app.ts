import type { FlowJson, MiniAppDefinition } from "@chatbotx.io/mini-app"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const miniAppModel = pgTable(
  "MiniApp",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    enabled: boolean().default(true).notNull(),
    // The editor model; `flowJson` is always regenerated from it on save.
    definition: jsonb().$type<MiniAppDefinition>().notNull(),
    flowJson: jsonb().$type<FlowJson>().notNull(),
    submissionsCount: integer().default(0).notNull(),
  },
  (table) => [
    index("MiniApp_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("MiniApp_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
