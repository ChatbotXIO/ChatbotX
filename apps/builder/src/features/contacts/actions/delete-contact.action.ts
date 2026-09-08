"use server"
import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { deleteContactRequest } from "../schema/contact-delete"

export const deleteContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(deleteContactRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await contactService.deleteAndRecord({
      workspaceId,
      ids: parsedInput.ids,
      accessScope,
      triggerSource: "api",
    })
  })
