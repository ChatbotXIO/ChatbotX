import { pgTable, text } from "drizzle-orm/pg-core"
import { userModel } from "../auth"
import { chatbotModel } from "../chatbot"
import { sharedColumns } from "../shared"

export const auditLogModel = pgTable("AuditLog", {
  ...sharedColumns,
  action: text().notNull(),
  detail: text().notNull(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AuditLog_chatbotId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "AuditLog_userId_fkey",
    }),
})
