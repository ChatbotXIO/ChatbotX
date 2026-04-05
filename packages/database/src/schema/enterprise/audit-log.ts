import { pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { userModel } from "../auth-user"
import { workspaceModel } from "../workspace"

export const auditLogModel = pgTable("AuditLog", {
  ...sharedColumns,
  action: text().notNull(),
  detail: text().notNull(),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AuditLog_workspaceId_fkey",
    }),
  userId: bigintAsString().references(() => userModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
    name: "AuditLog_userId_fkey",
  }),
})
