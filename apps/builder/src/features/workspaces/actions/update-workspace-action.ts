"use server"

import { workspaceService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWorkspaceAdvancedRequest,
  type UpdateWorkspaceBasicRequest,
  updateWorkspaceAdvancedRequest,
  updateWorkspaceBasicRequest,
} from "../schema/update-workspace-schema"

export const updateWorkspaceBasicAction = workspaceActionClient
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

export const updateWorkspaceAdvancedAction = workspaceActionClient
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
      await workspaceService.update({ id: workspaceId, data: parsedInput })
    },
  )
