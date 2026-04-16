import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const flowAnalyticsSessionRelations = defineRelationsPart(
  schema,
  (r) => ({
    flowAnalyticsSessionModel: {
      flow: r.one.flowModel({
        from: r.flowAnalyticsSessionModel.flowId,
        to: r.flowModel.id,
      }),
      workspace: r.one.workspaceModel({
        from: r.flowAnalyticsSessionModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)
