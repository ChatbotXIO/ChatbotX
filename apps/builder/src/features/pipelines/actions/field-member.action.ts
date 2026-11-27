"use server"

import {
  pipelineMemberService,
  pipelineStructureService,
} from "@chatbotx.io/business/pipeline"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { pipelineActionCaller } from "../lib/access"
import {
  createFieldPublicRequest,
  deleteFieldPublicRequest,
  removeMemberPublicRequest,
  setMemberPublicRequest,
  updateFieldPublicRequest,
} from "../schema/public"

export const createFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFieldPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, ...values } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    const field = await pipelineStructureService.createField({
      workspaceId,
      pipelineId: id,
      values,
      scope,
    })
    return { id: field.id }
  })

export const updateFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateFieldPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, fieldId, ...values } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    await pipelineStructureService.updateField({
      workspaceId,
      pipelineId: id,
      fieldId,
      values,
      scope,
    })
  })

export const deleteFieldAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteFieldPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope } = pipelineActionCaller(ctx)
    await pipelineStructureService.deleteField({
      workspaceId,
      pipelineId: parsedInput.id,
      fieldId: parsedInput.fieldId,
      scope,
    })
  })

export const setMemberAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(setMemberPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { id, workspaceMemberId, ...permissions } = parsedInput
    const { scope } = pipelineActionCaller(ctx)
    await pipelineMemberService.setMember({
      workspaceId,
      pipelineId: id,
      workspaceMemberId,
      permissions,
      scope,
    })
  })

export const removeMemberAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeMemberPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    const { scope } = pipelineActionCaller(ctx)
    await pipelineMemberService.removeMember({
      workspaceId,
      pipelineId: parsedInput.id,
      workspaceMemberId: parsedInput.workspaceMemberId,
      scope,
    })
  })
