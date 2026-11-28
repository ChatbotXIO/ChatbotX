"use server"
import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { contactTagByIdRequest } from "../schema/contact-tag"

/**
 * Detaches one tag from one contact by id; a tag the contact does not have is
 * ignored. Public equivalent: `contacts.removeTags`
 * (`DELETE /v1/contacts/{identifier}/tags`).
 */
export const removeContactTagByIdAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(contactTagByIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    await tagService.detachFromContact({
      workspaceId,
      contactId: parsedInput.contactId,
      tagIds: [parsedInput.tagId],
      accessScope,
    })
    return { contactId: parsedInput.contactId, tagId: parsedInput.tagId }
  })
