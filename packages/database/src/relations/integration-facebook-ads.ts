import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationFacebookAdsRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationFacebookAdsModel: {
      integration: r.one.integrationModel({
        from: r.integrationFacebookAdsModel.integrationId,
        to: r.integrationModel.id,
      }),
    },
  }),
)
