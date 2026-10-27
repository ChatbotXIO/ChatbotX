import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const pipelineRelations = defineRelationsPart(schema, (r) => ({
  pipelineModel: {
    workspace: r.one.workspaceModel({
      from: r.pipelineModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.pipelineModel.createdById,
      to: r.userModel.id,
    }),
    stages: r.many.pipelineStageModel({
      from: r.pipelineModel.id,
      to: r.pipelineStageModel.pipelineId,
    }),
    items: r.many.pipelineItemModel({
      from: r.pipelineModel.id,
      to: r.pipelineItemModel.pipelineId,
    }),
    fields: r.many.pipelineFieldModel({
      from: r.pipelineModel.id,
      to: r.pipelineFieldModel.pipelineId,
    }),
    members: r.many.pipelineMemberModel({
      from: r.pipelineModel.id,
      to: r.pipelineMemberModel.pipelineId,
    }),
  },
  pipelineStageModel: {
    pipeline: r.one.pipelineModel({
      from: r.pipelineStageModel.pipelineId,
      to: r.pipelineModel.id,
      optional: false,
    }),
    items: r.many.pipelineItemModel({
      from: r.pipelineStageModel.id,
      to: r.pipelineItemModel.stageId,
    }),
  },
  pipelineItemModel: {
    pipeline: r.one.pipelineModel({
      from: r.pipelineItemModel.pipelineId,
      to: r.pipelineModel.id,
      optional: false,
    }),
    stage: r.one.pipelineStageModel({
      from: r.pipelineItemModel.stageId,
      to: r.pipelineStageModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.pipelineItemModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.pipelineItemModel.createdById,
      to: r.userModel.id,
    }),
    assignees: r.many.pipelineItemAssigneeModel({
      from: r.pipelineItemModel.id,
      to: r.pipelineItemAssigneeModel.itemId,
    }),
    comments: r.many.pipelineItemCommentModel({
      from: r.pipelineItemModel.id,
      to: r.pipelineItemCommentModel.itemId,
    }),
    attachments: r.many.pipelineItemAttachmentModel({
      from: r.pipelineItemModel.id,
      to: r.pipelineItemAttachmentModel.itemId,
    }),
  },
  pipelineItemAssigneeModel: {
    item: r.one.pipelineItemModel({
      from: r.pipelineItemAssigneeModel.itemId,
      to: r.pipelineItemModel.id,
      optional: false,
    }),
    workspaceMember: r.one.workspaceMemberModel({
      from: r.pipelineItemAssigneeModel.workspaceMemberId,
      to: r.workspaceMemberModel.id,
    }),
    inboxTeam: r.one.inboxTeamModel({
      from: r.pipelineItemAssigneeModel.inboxTeamId,
      to: r.inboxTeamModel.id,
    }),
  },
  pipelineItemCommentModel: {
    item: r.one.pipelineItemModel({
      from: r.pipelineItemCommentModel.itemId,
      to: r.pipelineItemModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.pipelineItemCommentModel.createdById,
      to: r.userModel.id,
    }),
  },
  pipelineItemAttachmentModel: {
    item: r.one.pipelineItemModel({
      from: r.pipelineItemAttachmentModel.itemId,
      to: r.pipelineItemModel.id,
      optional: false,
    }),
    mediaLibraryFile: r.one.mediaLibraryFileModel({
      from: r.pipelineItemAttachmentModel.mediaLibraryFileId,
      to: r.mediaLibraryFileModel.id,
      optional: false,
    }),
  },
  pipelineItemActivityModel: {
    pipeline: r.one.pipelineModel({
      from: r.pipelineItemActivityModel.pipelineId,
      to: r.pipelineModel.id,
      optional: false,
    }),
    actorUser: r.one.userModel({
      from: r.pipelineItemActivityModel.actorUserId,
      to: r.userModel.id,
    }),
  },
  pipelineFieldModel: {
    pipeline: r.one.pipelineModel({
      from: r.pipelineFieldModel.pipelineId,
      to: r.pipelineModel.id,
      optional: false,
    }),
  },
  pipelineMemberModel: {
    pipeline: r.one.pipelineModel({
      from: r.pipelineMemberModel.pipelineId,
      to: r.pipelineModel.id,
      optional: false,
    }),
    workspaceMember: r.one.workspaceMemberModel({
      from: r.pipelineMemberModel.workspaceMemberId,
      to: r.workspaceMemberModel.id,
      optional: false,
    }),
  },
}))
