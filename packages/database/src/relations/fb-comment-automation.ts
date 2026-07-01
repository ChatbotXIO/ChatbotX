import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const fbCommentAutomationRelations = defineRelationsPart(
  schema,
  (r) => ({
    fbCommentAutomationModel: {
      workspace: r.one.workspaceModel({
        from: r.fbCommentAutomationModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      folder: r.one.folderModel({
        from: r.fbCommentAutomationModel.folderId,
        to: r.folderModel.id,
      }),
    },
  }),
)
