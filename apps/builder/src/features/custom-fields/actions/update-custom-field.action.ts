"use server"

import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { mapExceptionToFieldError } from "@/lib/action-field-error"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateCustomFieldRequest } from "../schema/action"

export const updateCustomFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateCustomFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await mapExceptionToFieldError(
      updateCustomFieldRequest,
      "name",
      () => customFieldService.update({ workspaceId, id }, parsedInput),
      "customField",
    )
  })
