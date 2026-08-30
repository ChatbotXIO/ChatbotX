"use server"

import { customFieldService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { mapExceptionToFieldError } from "@/lib/action-field-error"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldRequest,
} from "../schema/action"

export const createCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateCustomFieldRequest
    }) => {
      await mapExceptionToFieldError(
        createCustomFieldRequest,
        "name",
        () => customFieldService.create({ workspaceId, data: parsedInput }),
        "customField",
      )
    },
  )
