import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const lifecycleStageRelations = defineRelationsPart(schema, (r) => ({
  lifecycleStageModel: {
    workspace: r.one.workspaceModel({
      from: r.lifecycleStageModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    contacts: r.many.contactModel({
      from: r.lifecycleStageModel.id,
      to: r.contactModel.lifecycleStageId,
    }),
  },
}))
