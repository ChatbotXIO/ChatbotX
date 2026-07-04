import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const integrationOpenaiCompatibleModel = pgTable(
  "IntegrationOpenaiCompatible",
  {
    ...sharedColumns,
    auth: jsonb(),
    autoReply: boolean().default(false).notNull(),
    baseURL: text().notNull(),
    defaultModel: text().notNull(),
    enabled: boolean().default(true).notNull(),
    integrationId: bigintAsString()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    preset: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("IntegrationOpenaiCompatible_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationOpenaiCompatible_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationOpenaiCompatible_workspaceId_preset_key")
      .using("btree", table.workspaceId.asc().nullsLast(), table.preset.asc())
      .where(sql`${table.preset} <> 'custom'`),
  ],
)
