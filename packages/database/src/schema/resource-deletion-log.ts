import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  resourceDeletionResourceTypes,
  resourceDeletionStatuses,
} from "../partials/resource-deletion-log"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"

export const resourceDeletionResourceType = pgEnum(
  "resourceDeletionResourceType",
  resourceDeletionResourceTypes.options as [string, ...string[]],
)

export const resourceDeletionStatus = pgEnum(
  "resourceDeletionStatus",
  resourceDeletionStatuses.options as [string, ...string[]],
)

/**
 * Durable trail of who asked to delete a resource (a workspace, a channel…),
 * from where, and when the deletion really happened. One row per request: a
 * workspace deletion is `pending` from the user's submit until the purge job
 * completes it; a channel deletion is synchronous, so it is written already
 * `completed`.
 *
 * It deliberately has no foreign keys and no secondary indexes — only the
 * primary key — so it outlives the workspace, the user and the resource it
 * describes (`workspaceId`, `resourceId` and `requestedByUserId` are historical
 * values). `AuditLog` cannot serve that purpose: its `workspaceId` FK cascades,
 * so its rows disappear with the workspace. The consequence of having no index
 * is that lookups by resource scan the table; rows are only written by rare,
 * user-initiated deletions, so it stays small (see
 * `docs/resource-deletion-log.md`).
 *
 * `resourceId` is text so a future resource whose key is not a bigint still
 * fits. `resourceSubtype` is a free-form, resource-defined kind (for a channel,
 * its `ChannelType`) so shared code never has to know the channels.
 * `requestSource` is `AuditActor.source` as-is (`api-token:<id>`,
 * `mcp-oauth:<client>`, `template:uninstallTemplate`…); null means a session
 * request or no source available. `requestedByUserId` is null for a system
 * actor. Every lifecycle column is written explicitly — there is no database
 * default on `status` or on the timestamps below `requestedAt`.
 */
export const resourceDeletionLogModel = pgTable("ResourceDeletionLog", {
  ...sharedColumns,
  workspaceId: bigintAsString().notNull(),
  resourceType: resourceDeletionResourceType().notNull(),
  resourceId: text().notNull(),
  resourceSubtype: text(),
  resourceName: text(),
  status: resourceDeletionStatus().notNull(),
  requestedByUserId: bigintAsString(),
  requestSource: text(),
  ipAddress: text(),
  userAgent: text(),
  requestedAt: timestamp(timestampConfig).notNull(),
  completedAt: timestamp(timestampConfig),
  canceledAt: timestamp(timestampConfig),
})
