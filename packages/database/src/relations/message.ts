import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messageRelations = defineRelationsPart(schema, (r) => ({
  messageModel: {
    attachments: r.many.attachmentModel({
      from: r.messageModel.id,
      to: r.attachmentModel.messageId,
    }),
    workspace: r.one.workspaceModel({
      from: r.messageModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.messageModel.conversationId,
      to: r.conversationModel.id,
    }),
  },
}))
