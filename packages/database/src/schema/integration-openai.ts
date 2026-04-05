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
import { aiAgentModel } from "./ai-agent"
import { aiAssistantModel } from "./ai-assistant"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const integrationOpenaiModel = pgTable(
  "IntegrationOpenai",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    autoReply: boolean().default(true).notNull(),
    autoReplyVoice: boolean().default(false).notNull(),
    voice: text(),
    prompt: text(),
    model: text().notNull(),
    temperature: doublePrecision(),
    maxOutputTokens: integer().notNull(),
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
    aiAssistantId: bigintAsString().references(() => aiAssistantModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    aiAgentId: bigintAsString().references(() => aiAgentModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    uniqueIndex("IntegrationOpenAI_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)
