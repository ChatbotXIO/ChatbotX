import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiEmbeddingRelations = defineRelationsPart(schema, (r) => ({
  aiEmbeddingModel: {
    aiFile: r.one.aiFileModel({
      from: r.aiEmbeddingModel.aiFileId,
      to: r.aiFileModel.id,
    }),
  },
}))
