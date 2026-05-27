import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const conversationClosingNoteRelations = defineRelationsPart(
  schema,
  (r) => ({
    conversationClosingNoteModel: {
      workspace: r.one.workspaceModel({
        from: r.conversationClosingNoteModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      conversation: r.one.conversationModel({
        from: r.conversationClosingNoteModel.conversationId,
        to: r.conversationModel.id,
      }),
      category: r.one.conversationCategoryModel({
        from: r.conversationClosingNoteModel.categoryId,
        to: r.conversationCategoryModel.id,
      }),
      closedByUser: r.one.userModel({
        from: r.conversationClosingNoteModel.closedByUserId,
        to: r.userModel.id,
      }),
    },
  }),
)
