"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { mapExceptionToFieldError } from "@/lib/action-field-error"
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
    }) => {
      const data = await mapExceptionToFieldError(
        createTagRequest,
        "name",
        () => tagService.create({ workspaceId, data: parsedInput }),
        "tag",
      )
      return { data }
    },
  )
