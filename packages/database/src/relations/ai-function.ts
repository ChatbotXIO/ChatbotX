import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiFunctionRelations = defineRelationsPart(schema, (r) => ({
  aiFunctionModel: {
    workspace: r.one.workspaceModel({
      from: r.aiFunctionModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
