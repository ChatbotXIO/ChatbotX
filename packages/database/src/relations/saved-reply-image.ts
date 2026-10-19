import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const savedReplyImageRelations = defineRelationsPart(schema, (r) => ({
  savedReplyImageModel: {
    savedReply: r.one.savedReplyModel({
      from: r.savedReplyImageModel.savedReplyId,
      to: r.savedReplyModel.id,
      optional: false,
    }),
    mediaLibraryFile: r.one.mediaLibraryFileModel({
      from: r.savedReplyImageModel.mediaLibraryFileId,
      to: r.mediaLibraryFileModel.id,
      optional: false,
    }),
  },
}))
