import { pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { aiTriggerModel } from "./ai-trigger"
import { integrationOpenaiModel } from "./integration-openai"

export const aiTriggerToIntegrationOpenaiModel = pgTable(
  "AITriggerToIntegrationOpenai",
  {
    aiTriggerId: bigintAsString()
      .notNull()
      .references(() => aiTriggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationOpenaiId: bigintAsString()
      .notNull()
      .references(() => integrationOpenaiModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.aiTriggerId, table.integrationOpenaiId],
    }),
  ],
)
