import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const minigameRelations = defineRelationsPart(schema, (r) => ({
  minigameModel: {
    workspace: r.one.workspaceModel({
      from: r.minigameModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
