"use server"

import {
  pipelineStageBulkService,
  pipelineStructureService,
} from "@chatbotx.io/business/pipeline"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { pipelineActionCaller } from "../lib/access"
import {
  createStagePublicRequest,
  deleteStagePublicRequest,
  pipelineStageRequest,
  updateStagePublicRequest,
} from "../schema/public"

export const createStageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createStagePublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, name, ...values } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    const stage = await pipelineStructureService.createStage({
      workspaceId,
      pipelineId: id,
      name,
      values,
      scope,
    })
    return { id: stage.id }
  })

export const updateStageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateStagePublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, stageId, ...values } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    await pipelineStructureService.updateStage({
      workspaceId,
      pipelineId: id,
      stageId,
      values,
      scope,
    })
  })

/** Deletes the stage and its items; stays available after the trial ends. */
export const deleteStageAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(pipelineStageRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    return await pipelineStageBulkService.deleteStage({
      workspaceId,
      pipelineId: parsedInput.id,
      stageId: parsedInput.stageId,
      scope,
      actor,
    })
  })

/** Moves the items first, so it writes and needs an active workspace. */
export const deleteStageMovingItemsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(
    deleteStagePublicRequest.extend({
      moveItemsToStageId: zodBigintAsString(),
    }),
  )
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    return await pipelineStageBulkService.deleteStage({
      workspaceId,
      pipelineId: parsedInput.id,
      stageId: parsedInput.stageId,
      moveItemsToStageId: parsedInput.moveItemsToStageId,
      scope,
      actor,
    })
  })
