"use server"

import { reflinkService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
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
        if (error instanceof ChatbotXException && error.code === "validation") {
          return returnValidationErrors(createReflinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
