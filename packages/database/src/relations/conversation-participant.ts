import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const conversationParticipantRelations = defineRelationsPart(
  schema,
  (r) => ({
    conversationParticipantModel: {
      workspace: r.one.workspaceModel({
        from: r.conversationParticipantModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      conversation: r.one.conversationModel({
        from: r.conversationParticipantModel.conversationId,
        to: r.conversationModel.id,
      }),
      user: r.one.userModel({
        from: r.conversationParticipantModel.userId,
        to: r.userModel.id,
      }),
    },
  }),
)
