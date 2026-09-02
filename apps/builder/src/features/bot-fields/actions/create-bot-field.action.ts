"use server"

import { botFieldService } from "@chatbotx.io/business"
import { isDatabaseError } from "@chatbotx.io/database/client"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBotFieldRequest } from "../schema/action"

const UNIQUE_VIOLATION_CODE = "23505"

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
      if (
        isDatabaseError(error) &&
        error.cause.code === UNIQUE_VIOLATION_CODE
      ) {
        return returnValidationErrors(createBotFieldRequest, {
          _errors: ["Validation Exception"],
          name: { _errors: ["Name is already taken"] },
        })
      }
      throw error
    }
  })
