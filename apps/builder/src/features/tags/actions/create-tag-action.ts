"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateTagRequest, createTagRequest } from "../schema/action"

export const createTagAction = workspaceActionClient
  .inputSchema(createTagRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: CreateTagRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => await createTag({ workspaceId, ...parsedInput }),
  )

export const createTag = async (
  parsedInput: CreateTagRequest & { workspaceId: string },
) => {
  const { workspaceId, ...data } = parsedInput
  const newTag = await tagService.create({ workspaceId, data })

  return {
    data: newTag,
  }
}
