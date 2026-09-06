"use server"
import { contactNoteService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteContactNoteRequest } from "../schema/action"
export const deleteContactNoteAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(deleteContactNoteRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, contactId], parsedInput }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await contactNoteService.delete({
        workspaceId,
        contactId,
        accessScope,
        noteId: parsedInput.contactNoteId,
      })
    },
  )
