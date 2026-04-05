import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const flowVersionRelations = defineRelationsPart(schema, (r) => ({
  flowVersionModel: {
    flowRuns: r.many.flowRunModel({
      from: r.flowVersionModel.id,
      to: r.flowRunModel.flowVersionId,
    }),
    flow: r.one.flowModel({
      from: r.flowVersionModel.flowId,
      to: r.flowModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.flowVersionModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
