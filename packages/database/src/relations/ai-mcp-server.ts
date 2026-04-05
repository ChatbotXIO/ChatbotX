import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiMCPServerRelations = defineRelationsPart(schema, (r) => ({
  aiMCPServerModel: {
    workspace: r.one.workspaceModel({
      from: r.aiMCPServerModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
