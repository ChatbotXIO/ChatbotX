import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboxTeamRelations = defineRelationsPart(schema, (r) => ({
  inboxTeamModel: {
    conversations: r.many.conversationModel({
      from: r.inboxTeamModel.id,
      to: r.conversationModel.assignedInboxTeamId,
    }),
    workspace: r.one.workspaceModel({
      from: r.inboxTeamModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    inboxTeamMembers: r.many.inboxTeamMemberModel({
      from: r.inboxTeamModel.id,
      to: r.inboxTeamMemberModel.inboxTeamId,
    }),
    users: r.many.userModel({
      from: r.inboxTeamModel.id.through(r.inboxTeamMemberModel.inboxTeamId),
      to: r.userModel.id.through(r.inboxTeamMemberModel.userId),
    }),
  },
}))
