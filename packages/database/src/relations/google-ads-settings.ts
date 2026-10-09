import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const googleAdsSettingsRelations = defineRelationsPart(schema, (r) => ({
  googleAdsSettingsModel: {
    workspace: r.one.workspaceModel({
      from: r.googleAdsSettingsModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
