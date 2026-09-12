import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceSipNodeRelations = defineRelationsPart(schema, (r) => ({
  workspaceSipNodeModel: {
    workspace: r.one.workspaceModel({
      from: r.workspaceSipNodeModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
