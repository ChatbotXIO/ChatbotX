import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const userRelations = defineRelationsPart(schema, (r) => ({
  userModel: {
    accounts: r.many.accountModel({
      from: r.userModel.id,
      to: r.accountModel.userId,
    }),
    conversationParticipants: r.many.conversationParticipantModel({
      from: r.userModel.id,
      to: r.conversationParticipantModel.userId,
    }),
    inboxTeamMembers: r.many.inboxTeamMemberModel({
      from: r.userModel.id,
      to: r.inboxTeamMemberModel.userId,
    }),
    workspaceMembers: r.many.workspaceMemberModel({
      from: r.userModel.id,
      to: r.workspaceMemberModel.userId,
    }),
    auditLogs: r.many.auditLogModel({
      from: r.userModel.id,
      to: r.auditLogModel.userId,
    }),
    organizations: r.many.organizationModel({
      from: r.userModel.id.through(r.organizationMemberModel.userId),
      to: r.organizationModel.id.through(
        r.organizationMemberModel.organizationId,
      ),
    }),
    sessions: r.many.sessionModel({
      from: r.userModel.id,
      to: r.sessionModel.userId,
    }),
    organizationMembers: r.many.organizationMemberModel({
      from: r.userModel.id,
      to: r.organizationMemberModel.userId,
    }),
  },
}))
