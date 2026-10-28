"use server"

import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { mintWorkspaceToken } from "../lib/mint-workspace-token"
import {
  type CreateWorkspaceTokenRequest,
  createWorkspaceTokenRequest,
} from "../schema/action"

export const createWorkspaceTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createWorkspaceTokenRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateWorkspaceTokenRequest
    }) =>
      await mintWorkspaceToken(workspaceId, {
        name: parsedInput.name,
        permission: parsedInput.permission,
        scopes: parsedInput.allScopes ? null : parsedInput.scopes,
      }),
  )
