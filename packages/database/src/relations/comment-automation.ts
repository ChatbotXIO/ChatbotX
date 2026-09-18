import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const commentAutomationRelations = defineRelationsPart(schema, (r) => ({
  commentAutomationModel: {
    workspace: r.one.workspaceModel({
      from: r.commentAutomationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    folder: r.one.folderModel({
      from: r.commentAutomationModel.folderId,
      to: r.folderModel.id,
    }),
  },
}))
