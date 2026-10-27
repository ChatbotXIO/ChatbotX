"use server"

import {
  pipelineItemContentService,
  pipelineItemService,
} from "@chatbotx.io/business/pipeline"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { pipelineActionCaller } from "../lib/access"
import { addAttachmentsActionRequest } from "../schema/action"
import {
  addCommentPublicRequest,
  createItemPublicRequest,
  deleteCommentPublicRequest,
  moveItemPublicRequest,
  pipelineItemRequest,
  removeAttachmentPublicRequest,
  transferItemPublicRequest,
  updateItemPublicRequest,
} from "../schema/public"

export const createItemAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createItemPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const {
      id,
      contactId,
      title,
      mediaLibraryFileIds,
      idempotencyKey,
      ...fields
    } = parsedInput
    const { scope, actor } = pipelineActionCaller(ctx)
    const item = await pipelineItemService.create({
      workspaceId,
      pipelineId: id,
      contactId,
      fields: { title, ...fields },
      mediaLibraryFileIds,
      idempotencyKey,
      scope,
      actor,
    })
    return { id: item.id }
  })

export const updateItemAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateItemPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, itemId, ...fields } = parsedInput
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemService.update({
      workspaceId,
      pipelineId: id,
      itemId,
      fields,
      scope,
      actor,
    })
  })

export const moveItemAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(moveItemPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemService.move({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      stageId: parsedInput.stageId,
      scope,
      actor,
    })
  })

export const transferItemAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(transferItemPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemService.transfer({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      destinationPipelineId: parsedInput.destinationPipelineId,
      destinationStageId: parsedInput.destinationStageId,
      scope,
      actor,
    })
  })

export const deleteItemAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(pipelineItemRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemService.delete({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      scope,
      actor,
    })
  })

export const addCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addCommentPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemContentService.addComment({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      text: parsedInput.text,
      idempotencyKey: parsedInput.idempotencyKey,
      scope,
      actor,
    })
  })

export const deleteCommentAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteCommentPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemContentService.deleteComment({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      commentId: parsedInput.commentId,
      scope,
      actor,
    })
  })

export const addAttachmentsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addAttachmentsActionRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemContentService.addAttachments({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      mediaLibraryFileIds: parsedInput.mediaLibraryFileIds,
      scope,
      actor,
    })
  })

export const removeAttachmentAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeAttachmentPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    await pipelineItemContentService.removeAttachment({
      workspaceId,
      pipelineId: parsedInput.id,
      itemId: parsedInput.itemId,
      mediaLibraryFileId: parsedInput.mediaLibraryFileId,
      scope,
      actor,
    })
  })
