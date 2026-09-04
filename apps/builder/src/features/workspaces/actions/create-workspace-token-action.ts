"use server"

import { workspaceApiTokenService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { generateWorkspaceToken } from "@/features/integration-api/lib/generate-credentials"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireWorkspaceTokenSuperAdmin } from "../lib/require-workspace-token-super-admin"
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
    }) => {
      await requireWorkspaceTokenSuperAdmin(workspaceId)

      const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()

      await workspaceApiTokenService.createToken({
        workspaceId,
        name: parsedInput.name,
        permission: parsedInput.permission,
        tokenHash,
        tokenPrefix,
      })

      // Plaintext exists only in this return value — never persisted.
      return { token }
    },
  )
