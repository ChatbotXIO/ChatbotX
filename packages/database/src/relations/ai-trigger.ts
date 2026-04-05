import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiTriggerRelations = defineRelationsPart(schema, (r) => ({
  aiTriggerModel: {
    workspace: r.one.workspaceModel({
      from: r.aiTriggerModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
