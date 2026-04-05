import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const automatedResponseRelations = defineRelationsPart(schema, (r) => ({
  automatedResponseModel: {
    workspace: r.one.workspaceModel({
      from: r.automatedResponseModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
