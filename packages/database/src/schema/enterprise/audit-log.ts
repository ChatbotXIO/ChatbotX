import { bigint, pgTable, text } from "drizzle-orm/pg-core"
import { sharedColumns } from "../../partials/shared"
import { chatbotModel, userModel } from ".."

export const auditLogModel = pgTable("audit_logs", {
  ...sharedColumns,
  action: text().notNull(),
  detail: text().notNull(),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "audit_logs_chatbot_id_fkey",
    }),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "audit_logs_user_id_fkey",
    }),
})
