import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { userModel } from "../auth-user"

export const platformAdminModel = pgTable(
  "PlatformAdmin",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, { onDelete: "cascade" }),
    role: text().notNull().default("super-admin"),
  },
  (table) => [uniqueIndex("PlatformAdmin_userId_key").on(table.userId)],
)
