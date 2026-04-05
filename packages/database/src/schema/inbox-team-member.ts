import { pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { inboxTeamModel } from "./inbox-team"

export const inboxTeamMemberModel = pgTable("InboxTeamMember", {
  ...sharedColumns,
  inboxTeamId: bigintAsString()
    .notNull()
    .references(() => inboxTeamModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
