import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import type { WorkspaceMemberPermissions } from "../partials/workspace"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const invitationModel = pgTable(
  "Invitation",
  {
    ...sharedColumns,
    code: text().notNull(),
    permissions: jsonb().$type<WorkspaceMemberPermissions>().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
    workspaceId: bigintAsString().references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    invitedBy: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Invitation_code_key").using(
      "btree",
      table.code.asc().nullsLast(),
    ),
  ],
)
