"use server"

import { db } from "@chatbotx.io/database/client"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateIgStoryRequest,
  createIgStoryRequest,
} from "../schema/action"

export const createIgStory = async (
  workspaceId: string,
  input: CreateIgStoryRequest,
) => {
  const id = createId()

  const [record] = await db
    .insert(igStoryAutomationModel)
    .values({
      id,
      workspaceId,
      ...input,
    })
    .returning()

  return record
}

export const createIgStoryAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createIgStoryRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateIgStoryRequest
    }) => {
      const record = await createIgStory(workspaceId, parsedInput)
      return { id: record.id }
    },
  )
