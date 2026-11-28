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
 * Returns the tag so a caller can show it on the contact without re-reading
 * the contact's whole tag list, and whether the link now exists (`attached`).
 * Public equivalent: `contacts.addTags` (`POST /v1/contacts/{identifier}/tags`).
 */
export const addContactTagByIdAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(contactTagByIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const accessScope = await requireContactPermissionScope(workspaceId)
    const [tag] = await tagService.requireLiveTags({
      workspaceId,
      tagIds: [parsedInput.tagId],
    })
    const linkedTagIds = await tagService.attachToContact({
      workspaceId,
      contactId: parsedInput.contactId,
      tagIds: [parsedInput.tagId],
      accessScope,
    })
    return {
      contactId: parsedInput.contactId,
      tagId: parsedInput.tagId,
      tag,
      // False when the tag was deleted after the check above: the attach
      // skips it, and the caller must re-read instead of showing it applied.
      attached: linkedTagIds.includes(parsedInput.tagId),
    }
  })
