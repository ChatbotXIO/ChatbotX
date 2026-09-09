"use server"

import {
  automatedResponseService,
  type UpdateAutomatedResponseRequest,
} from "@chatbotx.io/business"
import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { automatedResponseTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAutomatedResponseRequest } from "../schema/action"

export const updateAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    automatedResponseTypes,
  ])
  .inputSchema(updateAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id, type],
      parsedInput,
    } = props

    return await updateAutomatedResponse({ workspaceId, id, type }, parsedInput)
  })

export const updateAutomatedResponse = async (
  ctx: { workspaceId: string; id: string; type: AutomatedResponseType },
  parsedInput: UpdateAutomatedResponseRequest,
) => {
  try {
    // `text`/`flowId` mutual-exclusion and cross-workspace `flowId`
    // validation live in `automatedResponseService.update` so every caller
    // (this action and the public API) gets the same invariants — caught
    // here so the form still sees a field-level error instead of a
    // generic toast.
    await automatedResponseService.update(ctx, parsedInput)
  } catch (error) {
    if (isValidationException(error)) {
      return returnValidationErrors(updateAutomatedResponseRequest, {
        _errors: ["Validation Exception"],
        flowId: { _errors: [error.message] },
      })
    }

    throw error
  }
}
