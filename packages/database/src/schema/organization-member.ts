import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { organizationModel } from "./organization"

export const organizationMemberModel = pgTable(
  "OrganizationMember",
  {
    ...sharedColumns,
    role: text().notNull(),
    organizationId: bigintAsString()
      .notNull()
      .references(() => organizationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("OrganizationMember_organizationId_userId_unique").on(
      table.organizationId,
      table.userId,
    ),
  ],
)
