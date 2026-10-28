import type {
  PipelineActivityView,
  PipelineItemView,
  PipelineWithCurrency,
} from "@chatbotx.io/business/pipeline"
import type {
  PipelineFieldModel,
  PipelineItemCommentModel,
  PipelineMemberModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import type { z } from "zod"
import type {
  publicPipelineActivityResource,
  publicPipelineAttachmentResource,
  publicPipelineCommentResource,
  publicPipelineFieldResource,
  publicPipelineItemResource,
  publicPipelineMemberResource,
  publicPipelineResource,
  publicPipelineStageResource,
} from "../schema/resource"

type PublicPipeline = z.infer<typeof publicPipelineResource>
type PublicStage = z.infer<typeof publicPipelineStageResource>
type PublicField = z.infer<typeof publicPipelineFieldResource>
type PublicMember = z.infer<typeof publicPipelineMemberResource>
type PublicItem = z.infer<typeof publicPipelineItemResource>
type PublicComment = z.infer<typeof publicPipelineCommentResource>
type PublicActivity = z.infer<typeof publicPipelineActivityResource>
type PublicAttachment = z.infer<typeof publicPipelineAttachmentResource>

export const toPublicPipeline = (
  pipeline: PipelineWithCurrency,
): PublicPipeline => ({
  id: pipeline.id,
  name: pipeline.name,
  type: pipeline.type,
  referenceName: pipeline.referenceName,
  currency: pipeline.currency,
  currencyOverride: pipeline.currencyOverride,
  settings: pipeline.settings,
  createdAt: pipeline.createdAt,
  updatedAt: pipeline.updatedAt,
})

export const toPublicStage = (stage: PipelineStageModel): PublicStage => ({
  id: stage.id,
  name: stage.name,
  description: stage.description,
  textColor: stage.textColor,
  backgroundColor: stage.backgroundColor,
  position: stage.position,
  processing: stage.bulkJobId !== null,
})

export const toPublicField = (field: PipelineFieldModel): PublicField => ({
  id: field.id,
  name: field.name,
  referenceName: field.referenceName,
  type: field.type,
  required: field.required,
  position: field.position,
})

export const toPublicMember = (member: PipelineMemberModel): PublicMember => ({
  workspaceMemberId: member.workspaceMemberId,
  canView: member.canView,
  canEdit: member.canEdit,
  canDelete: member.canDelete,
  canManageSettings: member.canManageSettings,
})

export const toPublicItem = (view: PipelineItemView): PublicItem => {
  const { item } = view
  return {
    id: item.id,
    pipelineId: item.pipelineId,
    stageId: item.stageId,
    contactId: item.contactId,
    contactName: view.contact?.fullName ?? null,
    number: item.number,
    title: item.title,
    description: item.description,
    value: item.value,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    fieldValues: item.fieldValues,
    assigneeMemberIds: view.assignees.workspaceMemberIds,
    assigneeInboxTeamIds: view.assignees.inboxTeamIds,
    commentCount: view.commentCount,
    createdById: item.createdById,
    stageEnteredAt: item.stageEnteredAt,
    closedAt: item.closedAt,
    lastCommentAt: item.lastCommentAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export const toPublicComment = (
  comment: PipelineItemCommentModel,
): PublicComment => ({
  id: comment.id,
  itemId: comment.itemId,
  text: comment.text,
  createdById: comment.createdById,
  createdAt: comment.createdAt,
})

export const toPublicActivity = (
  activity: PipelineActivityView,
): PublicActivity => ({
  id: activity.id,
  kind: activity.kind,
  actorKind: activity.actorKind,
  actorUserId: activity.actorUserId,
  fromStageId: activity.fromStageId,
  toStageId: activity.toStageId,
  fromStatus: activity.fromStatus,
  toStatus: activity.toStatus,
  fromValue: activity.fromValue,
  toValue: activity.toValue,
  fromPriority: activity.fromPriority,
  toPriority: activity.toPriority,
  fromDueDate: activity.fromDueDate,
  toDueDate: activity.toDueDate,
  fromTitle: activity.fromTitle,
  toTitle: activity.toTitle,
  fromPipelineId: activity.fromPipelineId,
  fromStageName: activity.fromStageName,
  toStageName: activity.toStageName,
  fromPipelineName: activity.fromPipelineName,
  pipelineName: activity.pipelineName,
  occurredAt: activity.occurredAt,
})

export const toPublicAttachment = (attachment: {
  mediaLibraryFile: {
    id: string
    name: string
    mimeType: string
    size: number
    path: string
  }
}): PublicAttachment => ({
  mediaLibraryFileId: attachment.mediaLibraryFile.id,
  name: attachment.mediaLibraryFile.name,
  mimeType: attachment.mediaLibraryFile.mimeType,
  size: attachment.mediaLibraryFile.size,
  path: attachment.mediaLibraryFile.path,
})
