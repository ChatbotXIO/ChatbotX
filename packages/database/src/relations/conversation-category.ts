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
      // Drizzle v2 (defineRelationsPart por arquivo) não infere reverse
      // entre arquivos diferentes — precisa from/to explícito mesmo em
      // .many. A inversa (`category` em conversationClosingNoteModel)
      // mora em /relations/conversation-closing-note.ts.
      closingNotes: r.many.conversationClosingNoteModel({
        from: r.conversationCategoryModel.id,
        to: r.conversationClosingNoteModel.categoryId,
      }),
    },
  }),
)
