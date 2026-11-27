"use server"

import { pipelineService } from "@chatbotx.io/business/pipeline"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { pipelineActionCaller } from "../lib/access"
import {
  createPipelinePublicRequest,
  pipelineIdRequest,
  updatePipelinePublicRequest,
} from "../schema/public"

export const createPipelineAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createPipelinePublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    const pipeline = await pipelineService.create({
      workspaceId,
      ...parsedInput,
      scope,
      actor,
    })
    return { id: pipeline.id }
  })

export const updatePipelineAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updatePipelinePublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, ...values } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    await pipelineService.update({ workspaceId, id, values, scope })
  })

export const duplicatePipelineAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(pipelineIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope, actor } = pipelineActionCaller(ctx)
    const copy = await pipelineService.duplicate({
      workspaceId,
      id: parsedInput.id,
      scope,
      actor,
    })
    return { id: copy.id }
  })

/** Deleting stays available after the trial ends (invariant 14). */
export const deletePipelineAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(pipelineIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope } = pipelineActionCaller(ctx)
    await pipelineService.delete({ workspaceId, id: parsedInput.id, scope })
  })
