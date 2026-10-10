import { jsonb, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import type { GoogleAdsSettingsDocument } from "../partials/google-ads"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Workspace-owned Google Ads options, one row per workspace. Lives apart from
 * `IntegrationGoogleAds` because that row is deleted on disconnect while these
 * options (conversion data consent) must survive it. Tenant is derived from
 * the workspace. No row means every option is at its default.
 */
export const googleAdsSettingsModel = pgTable(
  "GoogleAdsSettings",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Versioned document. NO `.default()` on purpose (AGENTS.md "phantom jsonb
    // defaults"): every write supplies it.
    settings: jsonb().$type<GoogleAdsSettingsDocument>().notNull(),
  },
  (table) => [
    uniqueIndex("GoogleAdsSettings_workspaceId_key").on(table.workspaceId),
  ],
)
