import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookMarketingMessageRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookMarketingMessageModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookMarketingMessageModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      audience: r.one.facebookMarketingMessageAudienceModel({
        from: r.facebookMarketingMessageModel.audienceId,
        to: r.facebookMarketingMessageAudienceModel.id,
      }),
    },
  }),
)
