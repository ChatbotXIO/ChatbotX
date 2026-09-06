"use server"
import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { addContactTagRequest } from "../schema/contact-tag"

export const addContactTagAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(addContactTagRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await tagService.attachByNamesToContacts({
      workspaceId,
      contactIds: parsedInput.ids,
      names: parsedInput.tags,
      accessScope,
    })
  })
