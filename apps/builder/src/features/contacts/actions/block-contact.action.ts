"use server"
import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"

export const blockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await contactService.blockAndRecord({ workspaceId, id, accessScope })
  })
