import { sql } from "drizzle-orm"
import { index, jsonb, pgEnum, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  type WorkspaceMemberNotificationChannels,
  type WorkspaceMemberNotificationTypes,
  type WorkspaceMemberPermissions,
  workspaceMemberRoles,
} from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const workspaceMemberRole = pgEnum(
  "workspaceMemberRole",
  workspaceMemberRoles.enum,
)

export const workspaceMemberModel = pgTable(
  "WorkspaceMember",
  {
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
    /**
     * Coarse "last came online" stamp for reporting only, written on the
     * offline->online transition. Not "is online right now" — that's answered
     * exclusively by Redis (workspacePresenceService.listOnlineMembers).
     */
    onlineSince: timestamp(timestampConfig),
  },
  (table) => [
    // Membership lookups are always (workspaceId, userId): auth gates
    // (findMembership), the working-hours member check (key-share lock, sorted
    // by userId) and the roster list. The FK columns have no index of their own.
    index("WorkspaceMember_workspaceId_userId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
  ],
)
