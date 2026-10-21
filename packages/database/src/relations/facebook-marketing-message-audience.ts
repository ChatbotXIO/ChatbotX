import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookMarketingMessageAudienceRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookMarketingMessageAudienceModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookMarketingMessageAudienceModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      marketingMessages: r.many.facebookMarketingMessageModel({
        from: r.facebookMarketingMessageAudienceModel.id,
        to: r.facebookMarketingMessageModel.audienceId,
      }),
    },
  }),
)
