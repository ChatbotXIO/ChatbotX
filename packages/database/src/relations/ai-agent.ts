import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiAgentRelations = defineRelationsPart(schema, (r) => ({
  aiAgentModel: {
    workspace: r.one.workspaceModel({
      from: r.aiAgentModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
