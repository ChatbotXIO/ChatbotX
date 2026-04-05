import { sql } from "drizzle-orm"
import { jsonb, pgEnum, pgTable } from "drizzle-orm/pg-core"
import {
  type WorkspaceMemberNotificationChannels,
  type WorkspaceMemberNotificationTypes,
  type WorkspaceMemberPermissions,
  workspaceMemberRoles,
} from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const workspaceMemberRole = pgEnum(
  "workspaceMemberRole",
  workspaceMemberRoles.options as [string, ...string[]],
)

export const workspaceMemberModel = pgTable("WorkspaceMember", {
  ...sharedColumns,
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  role: workspaceMemberRole().notNull(),
  notificationChannels: jsonb()
    .$type<WorkspaceMemberNotificationChannels>()
    .default(sql`'{}'`)
    .notNull(),
  notificationTypes: jsonb()
    .$type<WorkspaceMemberNotificationTypes>()
    .default(sql`'{}'`)
    .notNull(),
  permissions: jsonb()
    .$type<WorkspaceMemberPermissions>()
    .default(sql`'{}'`)
    .notNull(),
})
