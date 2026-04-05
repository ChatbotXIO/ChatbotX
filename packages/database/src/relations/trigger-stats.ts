import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const triggerStatsRelations = defineRelationsPart(schema, (r) => ({
  triggerStatsModel: {
    trigger: r.one.triggerModel({
      from: r.triggerStatsModel.triggerId,
      to: r.triggerModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.triggerStatsModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
