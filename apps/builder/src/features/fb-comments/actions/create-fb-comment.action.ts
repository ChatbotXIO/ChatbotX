"use server"

import { db } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateFbCommentRequest,
  createFbCommentRequest,
} from "../schema/action"

export const createFbComment = async (
  workspaceId: string,
  input: CreateFbCommentRequest,
) => {
  const id = createId()

  const [record] = await db
    .insert(fbCommentAutomationModel)
    .values({
      id,
      workspaceId,
      ...input,
    })
    .returning()

  return record
}

export const createFbCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFbCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFbCommentRequest
    }) => {
      const record = await createFbComment(workspaceId, parsedInput)
      return { id: record.id }
    },
  )
