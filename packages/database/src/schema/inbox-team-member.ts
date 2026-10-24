import { index, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { inboxTeamModel } from "./inbox-team"

export const inboxTeamMemberModel = pgTable(
  "InboxTeamMember",
  {
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
  },
  (table) => [
    // Teams of a member (`listTeamIdsByUserId`, `{{admin_team_name}}`).
    index("InboxTeamMember_userId_inboxTeamId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.inboxTeamId.asc().nullsLast(),
    ),
  ],
)
