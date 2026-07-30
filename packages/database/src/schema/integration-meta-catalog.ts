import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type MetaCatalogAuthMode,
  type MetaCatalogConnectionStatus,
  type MetaCatalogImportStatus,
  metaCatalogAuthModes,
  metaCatalogConnectionStatuses,
  metaCatalogImportStatuses,
} from "../partials/meta-catalog"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const metaCatalogAuthMode = pgEnum(
  "metaCatalogAuthMode",
  metaCatalogAuthModes.options as [
    MetaCatalogAuthMode,
    ...MetaCatalogAuthMode[],
  ],
)
export const metaCatalogConnectionStatus = pgEnum(
  "metaCatalogConnectionStatus",
  metaCatalogConnectionStatuses.options as [
    MetaCatalogConnectionStatus,
    ...MetaCatalogConnectionStatus[],
  ],
)
export const metaCatalogImportStatus = pgEnum(
  "metaCatalogImportStatus",
  metaCatalogImportStatuses.options as [
    MetaCatalogImportStatus,
    ...MetaCatalogImportStatus[],
  ],
)

export const integrationMetaCatalogModel = pgTable(
  "IntegrationMetaCatalog",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: bigintAsString()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    catalogId: text(),
    catalogName: text(),
    businessId: text(),
    encryptedAuth: jsonb(),
    authMode: metaCatalogAuthMode().default("oauth").notNull(),
    tokenExpiresAt: timestamp(timestampConfig),
    status: metaCatalogConnectionStatus().default("active").notNull(),
    deletedAt: timestamp(timestampConfig),
    importStatus: metaCatalogImportStatus().default("idle").notNull(),
    importTotalCount: integer().default(0).notNull(),
    importedCount: integer().default(0).notNull(),
    importFailedCount: integer().default(0).notNull(),
    importError: text(),
    lastImportedAt: timestamp(timestampConfig),
    currency: text().default("VND").notNull(),
    storeUrl: text(),
  },
  (table) => [
    uniqueIndex("IntegrationMetaCatalog_integrationId_key").on(
      table.integrationId,
    ),
    uniqueIndex("IntegrationMetaCatalog_workspaceId_key").on(table.workspaceId),
    index("IntegrationMetaCatalog_deletedAt_idx").on(table.deletedAt),
  ],
)
