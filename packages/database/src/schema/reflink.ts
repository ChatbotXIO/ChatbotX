import { bigint, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { customFieldModel } from "./contact"
import { flowModel } from "./flow"

export const reflinkModel = pgTable(
  "reflinks",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    flowId: bigint("flow_id", { mode: "bigint" })
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customFieldId: bigint("custom_field_id", { mode: "bigint" }).references(
      () => customFieldModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    uniqueIndex("reflinks_chatbot_id_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
