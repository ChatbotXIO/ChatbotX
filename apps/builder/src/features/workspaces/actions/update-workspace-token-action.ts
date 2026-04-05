"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
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

  await db
    .update(workspaceModel)
    .set({ token })
    .where(eq(workspaceModel.id, workspaceId))
}

export const updateWorkspaceTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWorkspaceTokenRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateWorkspaceTokenRequest
    }) => {
      await updateWorkspaceToken({ workspaceId, token: parsedInput.token })
    },
  )
