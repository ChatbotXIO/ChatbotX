import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookMarketingMessagesAuthRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookMarketingMessagesAuthModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookMarketingMessagesAuthModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
