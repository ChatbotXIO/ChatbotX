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
import { chatbotModel } from "../chatbot"
import { sharedColumns } from "../shared"
import { integrationModel } from "./base"

export const integrationGeminiModel = pgTable(
  "integration_geminis",
  {
    ...sharedColumns,
    auth: jsonb("auth").notNull(),
    autoReply: boolean("auto_reply").default(false).notNull(),
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
    maxOutputTokens: integer("max_output_tokens").notNull(),
    model: text("model").notNull(),
    prompt: text("prompt"),
    temperature: doublePrecision("temperature").notNull(),
  },
  (table) => [
    uniqueIndex("integration_geminis_chatbot_id_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    uniqueIndex("integration_geminis_integration_id_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
  ],
)
