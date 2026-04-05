import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiAssistantRelations = defineRelationsPart(schema, (r) => ({
  aiAssistantModel: {
    workspace: r.one.workspaceModel({
      from: r.aiAssistantModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
