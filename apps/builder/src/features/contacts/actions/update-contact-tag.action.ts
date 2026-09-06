"use server"
import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { updateContactTagRequest } from "../schema/contact-tag"

export const updateContactTagAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(updateContactTagRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    return await tagService.replaceContactTagsByNames({
      workspaceId,
      contactId: parsedInput.contactId,
      names: parsedInput.tags,
      accessScope,
    })
  })
