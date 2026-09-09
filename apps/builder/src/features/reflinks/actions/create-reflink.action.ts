"use server"

import { reflinkService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateReflinkRequest,
  createReflinkRequest,
} from "../schema/action"

export const createReflinkAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateReflinkRequest
    }) => {
      try {
        await reflinkService.create({ workspaceId, data: parsedInput })
      } catch (error) {
        if (isValidationException(error)) {
          return returnValidationErrors(createReflinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: [error.message] },
          })
        }

        throw error
      }
    },
  )
