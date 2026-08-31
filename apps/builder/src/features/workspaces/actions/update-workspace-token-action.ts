"use server"

import {
  workspaceApiTokenService,
  workspaceService,
} from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { hashToken } from "@/features/integration-api/lib/token-hash"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWorkspaceTokenRequest,
  updateWorkspaceTokenRequest,
} from "../schema/action"

const updateWorkspaceToken = async ({
  workspaceId,
  token,
}: {
  workspaceId: string
  token: string
}) => {
  if (!token.startsWith(workspaceId)) {
    return returnValidationErrors(updateWorkspaceTokenRequest, {
      _errors: ["Validation Exception"],
      token: {
        _errors: ["Token format is not valid"],
      },
    })
  }

  await workspaceService.update({
    id: workspaceId,
    data: { token },
  })
  await workspaceApiTokenService.replaceToken({
    workspaceId,
    tokenHash: await hashToken(token),
  })
}

export const updateWorkspaceTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWorkspaceTokenRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateWorkspaceTokenRequest
    }) => {
      await updateWorkspaceToken({ workspaceId, token: parsedInput.token })
    },
  )
