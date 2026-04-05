import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const conversationRelations = defineRelationsPart(schema, (r) => ({
  conversationModel: {
    attachments: r.many.attachmentModel({
      from: r.conversationModel.id,
      to: r.attachmentModel.conversationId,
    }),
    assignedInboxTeam: r.one.inboxTeamModel({
      from: r.conversationModel.assignedInboxTeamId,
      to: r.inboxTeamModel.id,
    }),
    assignedUser: r.one.userModel({
      from: r.conversationModel.assignedUserId,
      to: r.userModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.conversationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.conversationModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    conversationParticipants: r.many.conversationParticipantModel({
      from: r.conversationModel.id,
      to: r.conversationParticipantModel.conversationId,
    }),
    flowRuns: r.many.flowRunModel({
      from: r.conversationModel.id,
      to: r.flowRunModel.conversationId,
    }),
    messages: r.many.messageModel({
      from: r.conversationModel.id,
      to: r.messageModel.conversationId,
    }),
    contactInboxes: r.many.contactInboxModel({
      from: r.conversationModel.contactId,
      to: r.contactInboxModel.contactId,
    }),
  },
}))
