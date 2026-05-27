import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const conversationCategoryRelations = defineRelationsPart(
  schema,
  (r) => ({
    conversationCategoryModel: {
      workspace: r.one.workspaceModel({
        from: r.conversationCategoryModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      closingNotes: r.many.conversationClosingNoteModel(),
    },
  }),
)
