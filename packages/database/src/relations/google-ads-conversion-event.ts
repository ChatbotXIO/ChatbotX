import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const googleAdsConversionEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    googleAdsConversionEventModel: {
      workspace: r.one.workspaceModel({
        from: r.googleAdsConversionEventModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integrationGoogleAds: r.one.integrationGoogleAdsModel({
        from: r.googleAdsConversionEventModel.integrationGoogleAdsId,
        to: r.integrationGoogleAdsModel.id,
      }),
      contactInbox: r.one.contactInboxModel({
        from: r.googleAdsConversionEventModel.contactInboxId,
        to: r.contactInboxModel.id,
      }),
    },
  }),
)
