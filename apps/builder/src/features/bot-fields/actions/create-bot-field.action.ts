"use server"

import { botFieldService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBotFieldRequest } from "../schema/action"

export const createBotFieldAction = workspaceActionClient
  .inputSchema(createBotFieldRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    try {
      return await botFieldService.create({ workspaceId, data: parsedInput })
    } catch (error) {
      // Unique (workspaceId, type, name) — surface a field-level error under
      // Name instead of the generic toast (mirrors createCustomFieldAction).
      if (isValidationException(error)) {
        return returnValidationErrors(createBotFieldRequest, {
          _errors: ["Validation Exception"],
          name: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
