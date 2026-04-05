import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceUsageRelations = defineRelationsPart(schema, (r) => ({
  workspaceUsageModel: {
    workspace: r.one.workspaceModel({
      from: r.workspaceUsageModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
