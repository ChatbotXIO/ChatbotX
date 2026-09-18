import { sql } from "drizzle-orm"
import { jsonb, pgEnum, pgTable, timestamp } from "drizzle-orm/pg-core"
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
  /**
   * When this member most recently transitioned from offline to online
   * (their first live heartbeat after having none) in ANY workspace they
   * belong to's presence set. `null` until their first-ever heartbeat.
   * A durable, coarse "last came online" stamp for reporting ONLY — it is
   * monotonic (never cleared back to `null`, and never updated again while
   * already online), so it can NOT answer "is this member online right
   * now". That question is answered exclusively by Redis:
   * `workspacePresenceService.listOnlineMembers`
   * (`packages/business/src/workspace-presence/service.ts`), whose TTL
   * (`PRESENCE_TTL_MS`) is the single source of truth for live status.
   * Written by `workspaceMemberRepository.markOnlineBulk`, called from
   * `workspacePresenceService.heartbeatMany` only on the offline -> online
   * transition, never on every heartbeat. No supporting index: nothing
   * queries by this column yet (YAGNI) — add one alongside whatever report
   * first reads it.
   */
  onlineSince: timestamp(timestampConfig),
})
