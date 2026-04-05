import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const botFieldRelations = defineRelationsPart(schema, (r) => ({
  botFieldModel: {
    workspace: r.one.workspaceModel({
      from: r.botFieldModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
