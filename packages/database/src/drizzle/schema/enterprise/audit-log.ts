import { pgTable, text } from "drizzle-orm/pg-core"
import { chatbotModel, userModel } from ".."
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
