"use server"
import { contactNoteService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
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
      try {
        return await contactNoteService.delete({
          workspaceId,
          contactId,
          accessScope,
          noteId: parsedInput.contactNoteId,
        })
      } catch (error) {
        // Deleting an already-deleted note is a no-op for the UI: the notes
        // list is optimistic, so a double-click or a stale list would
        // otherwise surface an error toast for work that is already done.
        // The public API keeps the 404 — only this surface swallows it.
        if (error instanceof ChatbotXException && error.code === "notFound") {
          return
        }
        throw error
      }
    },
  )
