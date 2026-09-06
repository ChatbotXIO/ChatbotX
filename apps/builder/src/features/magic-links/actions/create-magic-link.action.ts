"use server"

import { magicLinkService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMagicLinkRequest,
  createMagicLinkRequest,
} from "../schema/action"

export const createMagicLinkAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMagicLinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateMagicLinkRequest
    }) => {
      try {
        await magicLinkService.create({ workspaceId, data: parsedInput })
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "validation") {
          return returnValidationErrors(createMagicLinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
