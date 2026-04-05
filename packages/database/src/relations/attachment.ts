import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const attachmentRelations = defineRelationsPart(schema, (r) => ({
  attachmentModel: {
    workspace: r.one.workspaceModel({
      from: r.attachmentModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.attachmentModel.conversationId,
      to: r.conversationModel.id,
    }),
    message: r.one.messageModel({
      from: r.attachmentModel.messageId,
      to: r.messageModel.id,
    }),
  },
}))
