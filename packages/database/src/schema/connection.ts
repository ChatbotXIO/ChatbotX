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
 * Unified connection state keyed by `(workspaceId, provider, sourceId)`.
 * Channel rows have `channel`/`inboxId`; workspace integrations have `integrationId`.
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
  ],
)
