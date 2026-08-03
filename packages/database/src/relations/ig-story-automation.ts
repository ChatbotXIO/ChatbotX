import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const igStoryAutomationRelations = defineRelationsPart(schema, (r) => ({
  igStoryAutomationModel: {
    workspace: r.one.workspaceModel({
      from: r.igStoryAutomationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    folder: r.one.folderModel({
      from: r.igStoryAutomationModel.folderId,
      to: r.folderModel.id,
    }),
  },
}))
