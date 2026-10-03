import type { ChannelType } from "@chatbotx.io/utils/channel"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ConnectionKind,
  type ConnectionStatus,
  type ConnectionStatusReason,
  connectionKinds,
  connectionStatuses,
  connectionStatusReasons,
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
 * Unified connection state keyed by `(workspaceId, provider, sourceId)`.
 * Each Inbox and each Integration owns at most one Connection
 * (`Connection_inboxId_key` / `Connection_integrationId_key`). Channel rows
 * have `channel`/`inboxId`; workspace integrations have `integrationId`.
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
      onDelete: "cascade",
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
    uniqueIndex("Connection_workspaceId_provider_sourceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.provider.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("Connection_provider_sourceId_idx").using(
      "btree",
      table.provider.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    uniqueIndex("Connection_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("Connection_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
    check(
      "Connection_kind_relation_check",
      sql`(
        (${table.kind} = 'channel' AND ${table.inboxId} IS NOT NULL AND ${table.channel} IS NOT NULL)
        OR
        (${table.kind} = 'integration' AND ${table.inboxId} IS NULL AND ${table.channel} IS NULL AND ${table.integrationId} IS NOT NULL)
      )`,
    ),
    check(
      "Connection_inbox_integration_exclusive_check",
      sql`NOT (${table.inboxId} IS NOT NULL AND ${table.integrationId} IS NOT NULL)`,
    ),
    check(
      "Connection_kind_check",
      sql`${table.kind} IN (${sql.join(
        connectionKinds.options.map((kind) => sql`${kind}`),
        sql`, `,
      )})`,
    ),
    check(
      "Connection_status_check",
      sql`${table.status} IN (${sql.join(
        connectionStatuses.options.map((status) => sql`${status}`),
        sql`, `,
      )})`,
    ),
    check(
      "Connection_statusReason_check",
      sql`${table.statusReason} IN (${sql.join(
        connectionStatusReasons.options.map((reason) => sql`${reason}`),
        sql`, `,
      )})`,
    ),
    // Status metadata describes the current state, not a past one. Every
    // non-connected state has a reason; only a disconnect carries a timestamp.
    check(
      "Connection_status_reason_check",
      sql`(${table.status} = 'connected') = (${table.statusReason} IS NULL)`,
    ),
    check(
      "Connection_disconnectedAt_check",
      sql`(${table.status} = 'disconnected') = (${table.disconnectedAt} IS NOT NULL)`,
    ),
  ],
)
