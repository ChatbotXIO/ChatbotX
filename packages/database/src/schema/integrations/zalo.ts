import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../../partials/shared"
import { chatbotModel } from "../chatbot"
import { flowModel } from "../flow"
import { inboxModel } from "../inbox"

export const integrationZaloModel = pgTable(
  "integration_zalos",
  {
    ...sharedColumns,
    auth: jsonb("auth").$type<{ [x: string]: unknown }>().notNull(),
    oaId: text("oa_id").notNull(),
    name: text("name").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigint("inbox_id", { mode: "bigint" })
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fallbackFlowId: bigint("fallback_flow_id", { mode: "bigint" }).references(
      () => flowModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    index("integration_zalos_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("integration_zalos_fallback_flow_id_idx").using(
      "btree",
      table.fallbackFlowId.asc().nullsLast(),
    ),
    uniqueIndex("integration_zalos_inbox_id_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
  ],
)
