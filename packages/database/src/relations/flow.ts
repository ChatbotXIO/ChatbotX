import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const flowRelations = defineRelationsPart(schema, (r) => ({
  flowModel: {
    flowRuns: r.many.flowRunModel({
      from: r.flowModel.id,
      to: r.flowRunModel.flowId,
    }),
    flowVersions: r.many.flowVersionModel({
      from: r.flowModel.id,
      to: r.flowVersionModel.flowId,
    }),
    workspace: r.one.workspaceModel({
      from: r.flowModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
