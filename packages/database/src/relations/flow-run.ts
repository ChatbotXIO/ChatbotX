import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const flowRunRelations = defineRelationsPart(schema, (r) => ({
  flowRunModel: {
    workspace: r.one.workspaceModel({
      from: r.flowRunModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.flowRunModel.conversationId,
      to: r.conversationModel.id,
    }),
    flow: r.one.flowModel({
      from: r.flowRunModel.flowId,
      to: r.flowModel.id,
    }),
    flowVersion: r.one.flowVersionModel({
      from: r.flowRunModel.flowVersionId,
      to: r.flowVersionModel.id,
    }),
  },
}))
