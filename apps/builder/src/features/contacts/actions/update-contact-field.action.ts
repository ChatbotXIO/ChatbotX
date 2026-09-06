"use server"
import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { updateContactFieldRequest } from "../schema/action"

export const updateContactFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateContactFieldRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await contactService.updateFieldsAndCustomFields(
      { workspaceId, id, accessScope },
      parsedInput,
    )
  })
