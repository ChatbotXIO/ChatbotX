import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceApiTokenRelations = defineRelationsPart(schema, (r) => ({
  workspaceApiTokenModel: {
    workspace: r.one.workspaceModel({
      from: r.workspaceApiTokenModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
