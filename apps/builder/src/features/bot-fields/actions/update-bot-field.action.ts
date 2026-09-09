"use server"

import { botFieldService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBotFieldRequest,
  updateBotFieldRequest,
} from "../schema/action"

export const updateBotFieldAction = workspaceActionClient
  .inputSchema(updateBotFieldRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateBotFieldRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      try {
        return await botFieldService.updateByKey({
          workspaceId,
          key: id,
          data: parsedInput,
        })
      } catch (error) {
        // Renaming into an existing (type, name) hits the same unique index
        // as create — surface it under the Name field, not a generic toast.
        if (isValidationException(error)) {
          return returnValidationErrors(updateBotFieldRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: [error.message] },
          })
        }
        throw error
      }
    },
  )
