import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationGoogleAdsRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationGoogleAdsModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationGoogleAdsModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integration: r.one.integrationModel({
        from: r.integrationGoogleAdsModel.integrationId,
        to: r.integrationModel.id,
        optional: false,
      }),
    },
  }),
)
