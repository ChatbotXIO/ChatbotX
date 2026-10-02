import type { ChannelType } from "@chatbotx.io/utils/channel"
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  ConnectionKind,
  ConnectionStatus,
  ConnectionStatusReason,
} from "../partials/connection"
import type { IntegrationType } from "../partials/integration"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { inboxModel } from "./inbox"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

/**
 * Unified Connection domain: one row per `(workspaceId, provider, sourceId)`
 * — revive-or-insert, never duplicate, matching `Inbox` semantics.
 * `channel`/`inboxId` are set iff `kind = "channel"`; `integrationId` is set
 * for workspace-level integrations and survives satellite delete as
 * `disconnected` (`onDelete: "set null"`). See
 * `packages/business/src/connection/state.ts` for the status state machine
 * this table's `status`/`statusReason` columns drive.
 */
export const connectionModel = pgTable(
  "Connection",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: text().$type<IntegrationType>().notNull(),
    kind: text().$type<ConnectionKind>().notNull(),
    channel: text().$type<ChannelType>(),
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    integrationId: bigintAsString().references(() => integrationModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // pageId / phoneNumberId / igId / oaId / botId / openId / "workspace" for singletons.
    sourceId: text().notNull(),
    displayName: text().notNull(),
    status: text().$type<ConnectionStatus>().notNull().default("connected"),
    statusReason: text().$type<ConnectionStatusReason>(),
    lastError: text(),
    authExpiresAt: timestamp(timestampConfig),
    createdBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    connectedAt: timestamp(timestampConfig),
    disconnectedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Connection_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Connection_workspaceId_provider_sourceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.provider.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    uniqueIndex("Connection_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    // Workspace-level integrations are 1:1 with their Integration row, but
    // multiple Connection rows may share `integrationId = NULL` (channels).
    // A plain unique index on a nullable column already allows multiple
    // NULL rows in Postgres (NULLs are never equal to each other) — no
    // partial/WHERE clause needed. Channel connections (integrationId NULL)
    // are unconstrained here; workspace-level integrations (integrationId
    // set) are enforced 1:1 with their Integration row.
    uniqueIndex("Connection_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
    index("Connection_status_authExpiresAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.authExpiresAt.asc().nullsLast(),
    ),
  ],
)
