import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../../partials/shared"
import { aiAgentModel, aiAssistantModel } from "../ai"
import { chatbotModel } from "../chatbot"
import { integrationModel } from "./base"

export const integrationOpenAIModel = pgTable(
  "integration_open_ais",
  {
    ...sharedColumns,
    auth: jsonb("auth").notNull(),
    autoReply: boolean("auto_reply").default(true).notNull(),
    autoReplyVoice: boolean("auto_reply_voice").default(false).notNull(),
    voice: text("voice"),
    prompt: text("prompt"),
    model: text("model").notNull(),
    temperature: doublePrecision("temperature").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: bigint("integration_id", { mode: "bigint" })
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    aiAssistantId: bigint("ai_assistant_id", { mode: "bigint" }).references(
      () => aiAssistantModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    aiAgentId: bigint("ai_agent_id", { mode: "bigint" }).references(
      () => aiAgentModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    uniqueIndex("integration_open_ais_integration_id_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)
