import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceBotMessageUsageRelations = defineRelationsPart(
  schema,
  (r) => ({
    workspaceBotMessageUsageModel: {
      owner: r.one.userModel({
        from: r.workspaceBotMessageUsageModel.ownerId,
        to: r.userModel.id,
      }),
    },
  }),
)
