import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const mediaLibraryFolderRelations = defineRelationsPart(schema, (r) => ({
  mediaLibraryFolderModel: {
    files: r.many.mediaLibraryFileModel({
      from: r.mediaLibraryFolderModel.id,
      to: r.mediaLibraryFileModel.folderId,
    }),
    workspace: r.one.workspaceModel({
      from: r.mediaLibraryFolderModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
