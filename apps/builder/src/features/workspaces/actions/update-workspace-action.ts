"use server"

import { workspaceService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowScheduledDeletion,
} from "@/lib/safe-action"
import {
  type UpdateSmartResponseDelayRequest,
  type UpdateWorkspaceAdvancedRequest,
  type UpdateWorkspaceBasicRequest,
  updateSmartResponseDelayRequest,
  updateWorkspaceAdvancedRequest,
  updateWorkspaceBasicRequest,
} from "../schema/update-workspace-schema"

export const updateWorkspaceBasicAction =
  workspaceActionClientAllowScheduledDeletion
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(updateWorkspaceBasicRequest)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
        parsedInput,
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
        parsedInput: UpdateWorkspaceBasicRequest
      }) => {
        await workspaceService.update({ id: workspaceId, data: parsedInput })
      },
    )

export const updateWorkspaceAdvancedAction =
  workspaceActionClientAllowScheduledDeletion
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(updateWorkspaceAdvancedRequest)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
        parsedInput,
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
        parsedInput: UpdateWorkspaceAdvancedRequest
      }) => {
        // Same service method as the public settings route. The form sends ""
        // when no Default Reply flow is picked; that clears it.
        await workspaceService.updateSettings({
          id: workspaceId,
          data: {
            ...parsedInput,
            defaultReply: parsedInput.defaultReply || null,
          },
        })
      },
    )

export const updateSmartResponseDelayAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateSmartResponseDelayRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateSmartResponseDelayRequest
    }) => {
      await workspaceService.updateSettings({
        id: workspaceId,
        data: parsedInput,
      })
    },
  )
