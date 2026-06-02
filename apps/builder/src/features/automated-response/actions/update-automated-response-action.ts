"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { flowService } from "@/features/flows/flow.service"
import { workspaceActionClient } from "@/lib/safe-action"
import { automatedResponseService } from "../automated-response.service"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schema/action"

export const updateAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAutomatedResponse({ workspaceId, id }, parsedInput)
  })

export const updateAutomatedResponse = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAutomatedResponseRequest,
) => {
  await automatedResponseService.findOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
  })

  if (parsedInput.text?.length) {
    parsedInput.flowId = undefined
  } else if (parsedInput.flowId) {
    const exists = await flowService.exists(ctx.workspaceId, parsedInput.flowId)
    if (!exists) {
      return returnValidationErrors(updateAutomatedResponseRequest, {
        _errors: ["Validation Exception"],
        flowId: {
          _errors: ["Flow not found"],
        },
      })
    }
    parsedInput.text = null
  }

  await automatedResponseService.update(ctx, parsedInput)
}
