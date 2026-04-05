import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const integrationGeminiModel = pgTable(
  "IntegrationGemini",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    autoReply: boolean().default(false).notNull(),
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
    maxOutputTokens: integer().notNull(),
    model: text().notNull(),
    prompt: text(),
    temperature: doublePrecision(),
  },
  (table) => [
    uniqueIndex("IntegrationGemini_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationGemini_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)
