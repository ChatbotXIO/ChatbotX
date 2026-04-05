import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiFileRelations = defineRelationsPart(schema, (r) => ({
  aiFileModel: {
    aiEmbeddings: r.many.aiEmbeddingModel({
      from: r.aiFileModel.id,
      to: r.aiEmbeddingModel.aiFileId,
    }),
    workspace: r.one.workspaceModel({
      from: r.aiFileModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
