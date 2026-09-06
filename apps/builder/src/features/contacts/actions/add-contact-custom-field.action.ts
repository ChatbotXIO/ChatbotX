"use server"
import { contactCustomFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { addContactCustomFieldRequest } from "../schema/contact-custom-field"

export const addContactCustomFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(addContactCustomFieldRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await contactCustomFieldService.applyOperationToContacts({
      workspaceId,
      contactIds: parsedInput.ids,
      customFieldId: parsedInput.customFieldId,
      operation: parsedInput.operation,
      value: parsedInput.value,
      sourceTimezone: parsedInput.clientTimezone,
      accessScope,
    })
  })
