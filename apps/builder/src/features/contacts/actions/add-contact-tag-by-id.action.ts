"use server"
import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import { contactTagByIdRequest } from "../schema/contact-tag"

/**
 * Attaches one existing tag to one contact by id. Unlike the by-name action
 * this never creates a tag: an id that is not a live tag of the workspace
 * (deleted or renamed away since the caller listed it) is "Tag not found".
 * Public equivalent: `contacts.addTags` (`POST /v1/contacts/{identifier}/tags`).
 */
export const addContactTagByIdAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(contactTagByIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    await tagService.assertLiveTags({
      workspaceId,
      tagIds: [parsedInput.tagId],
    })
    await tagService.attachToContact({
      workspaceId,
      contactId: parsedInput.contactId,
      tagIds: [parsedInput.tagId],
      accessScope,
    })
    return { contactId: parsedInput.contactId, tagId: parsedInput.tagId }
  })
