import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiConversationSourceRelations = defineRelationsPart(
  schema,
  (r) => ({
    aiConversationSourceModel: {
      workspace: r.one.workspaceModel({
        from: r.aiConversationSourceModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      conversation: r.one.conversationModel({
        from: r.aiConversationSourceModel.conversationId,
        to: r.conversationModel.id,
      }),
      message: r.one.messageModel({
        from: r.aiConversationSourceModel.messageId,
        to: r.messageModel.id,
      }),
      attachment: r.one.attachmentModel({
        from: r.aiConversationSourceModel.attachmentId,
        to: r.attachmentModel.id,
      }),
      embeddings: r.many.aiConversationEmbeddingModel({
        from: r.aiConversationSourceModel.id,
        to: r.aiConversationEmbeddingModel.sourceId,
      }),
    },
    aiConversationEmbeddingModel: {
      source: r.one.aiConversationSourceModel({
        from: r.aiConversationEmbeddingModel.sourceId,
        to: r.aiConversationSourceModel.id,
      }),
      workspace: r.one.workspaceModel({
        from: r.aiConversationEmbeddingModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      conversation: r.one.conversationModel({
        from: r.aiConversationEmbeddingModel.conversationId,
        to: r.conversationModel.id,
      }),
    },
  }),
)
