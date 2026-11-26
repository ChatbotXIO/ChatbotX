import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messageTranslationRelations = defineRelationsPart(schema, (r) => ({
  messageTranslationModel: {
    workspace: r.one.workspaceModel({
      from: r.messageTranslationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    conversation: r.one.conversationModel({
      from: r.messageTranslationModel.conversationId,
      to: r.conversationModel.id,
      optional: false,
    }),
  },
}))
