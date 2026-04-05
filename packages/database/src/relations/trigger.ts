import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const triggerRelations = defineRelationsPart(schema, (r) => ({
  triggerModel: {
    conditions: r.many.conditionModel({
      from: r.triggerModel.id,
      to: r.conditionModel.triggerId,
    }),
    workspace: r.one.workspaceModel({
      from: r.triggerModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    folder: r.one.folderModel({
      from: r.triggerModel.folderId,
      to: r.folderModel.id,
    }),
  },
}))
