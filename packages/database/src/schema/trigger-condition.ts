import { index, jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { triggerModel } from "./trigger"
import { webhookModel } from "./webhook"

export const conditionModel = pgTable(
  "Condition",
  {
    ...sharedColumns,
    triggerId: bigintAsString().references(() => triggerModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    webhookId: bigintAsString().references(() => webhookModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    type: text().notNull(),
    sourceId: text(),
    operator: varchar("operator", {
      length: 255,
    }),
    value: jsonb(),
  },
  (table) => [
    index("Condition_type_source_id_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("Condition_triggerId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
    ),
    index("Condition_webhookId_idx").using(
      "btree",
      table.webhookId.asc().nullsLast(),
    ),
    index("Condition_type_sourceId_triggerId_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.triggerId.asc().nullsLast(),
    ),
    index("Condition_type_sourceId_webhookId_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.webhookId.asc().nullsLast(),
    ),
  ],
)
