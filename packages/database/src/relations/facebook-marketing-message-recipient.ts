import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookMarketingMessageRecipientRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookMarketingMessageRecipientModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookMarketingMessageRecipientModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      campaign: r.one.facebookMarketingMessageModel({
        from: r.facebookMarketingMessageRecipientModel.campaignRowId,
        to: r.facebookMarketingMessageModel.id,
        optional: false,
      }),
    },
  }),
)
