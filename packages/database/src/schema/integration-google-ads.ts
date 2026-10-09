import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  GoogleAdsConversionActionCacheEntry,
  GoogleAdsSetupError,
} from "../partials/google-ads"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

// Connection-engine satellite. The table name is load-bearing: `makeAuthStore`
// resolves "Integration" + PascalCase(integrationType) → `IntegrationGoogleAds`.
export const integrationGoogleAdsModel = pgTable(
  "IntegrationGoogleAds",
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
    auth: jsonb().notNull(),
    // Written by the connection engine from `candidateToConfig`.
    customerId: text().notNull(),
    // Manager account the signed-in user reaches `customerId` through; null = direct access.
    loginCustomerId: text(),
    descriptiveName: text(),
    currencyCode: text(),
    // Written by the Google Ads setup service after connect / on sync.
    // null = "not resolved / never synced yet", distinct from false / [].
    conversionCustomerId: text(),
    acceptedCustomerDataTerms: boolean(),
    conversionActions: jsonb().$type<GoogleAdsConversionActionCacheEntry[]>(),
    conversionActionsSyncedAt: timestamp(timestampConfig),
    setupError: text().$type<GoogleAdsSetupError>(),
    setupErrorAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("IntegrationGoogleAds_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationGoogleAds_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
