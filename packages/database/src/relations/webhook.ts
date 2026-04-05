import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const webhookRelations = defineRelationsPart(schema, (r) => ({
  webhookModel: {
    conditions: r.many.conditionModel({
      from: r.webhookModel.id,
      to: r.conditionModel.webhookId,
    }),
    workspace: r.one.workspaceModel({
      from: r.webhookModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    folder: r.one.folderModel({
      from: r.webhookModel.folderId,
      to: r.folderModel.id,
    }),
  },
}))
