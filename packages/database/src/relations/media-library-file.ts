import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const mediaLibraryFileRelations = defineRelationsPart(schema, (r) => ({
  mediaLibraryFileModel: {
    folder: r.one.mediaLibraryFolderModel({
      from: r.mediaLibraryFileModel.folderId,
      to: r.mediaLibraryFolderModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.mediaLibraryFileModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
