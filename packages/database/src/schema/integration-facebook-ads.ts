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
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const integrationFacebookAdsStatuses = ["active", "invalid"] as const
export type IntegrationFacebookAdsStatus =
  (typeof integrationFacebookAdsStatuses)[number]

export const integrationFacebookAdsModel = pgTable(
  "IntegrationFacebookAds",
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
    tokenExpiresAt: timestamp(timestampConfig),
    status: text()
      .$type<IntegrationFacebookAdsStatus>()
      .default("active")
      .notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationFacebookAds_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationFacebookAds_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
