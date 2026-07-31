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
  type CreateIgCommentRequest,
  createIgCommentRequest,
} from "../schema/action"

export const createIgComment = async (
  workspaceId: string,
  input: CreateIgCommentRequest,
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

export const createIgCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createIgCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateIgCommentRequest
    }) => {
      const record = await createIgComment(workspaceId, parsedInput)
      return { id: record.id }
    },
  )
