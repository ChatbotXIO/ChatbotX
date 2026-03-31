import { bigint, index, pgTable, text } from "drizzle-orm/pg-core"
import { z } from "zod"
import { chatbotModel } from "../chatbot"
import { sharedColumns } from "../shared"

export const integrationTypes = z.enum([
  "webchat",
  "googleSheets",
  "messenger",
  "openai",
  "gemini",
  "whatsapp",
  "zalo",
  "chatbotX",
])
export type IntegrationType = z.infer<typeof integrationTypes>

export const integrationModel = pgTable(
  "integrations",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationType: text("integration_type").notNull(),
  },
  (table) => [
    index("integrations_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("integrations_chatbot_id_integration_type_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.integrationType.asc().nullsLast(),
    ),
  ],
)
