"use server"

import { contactService } from "@chatbotx.io/business"
import { and, db, eq } from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type DeleteContactNoteRequest,
  deleteContactNoteRequest,
} from "../schemas/action"

export const deleteContactNoteAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(deleteContactNoteRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await deleteContactNote({ workspaceId, id }, parsedInput)
  })

export const deleteContactNote = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: DeleteContactNoteRequest,
) => {
  const contact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
  })

  await db
    .delete(contactNoteModel)
    .where(
      and(
        eq(contactNoteModel.id, parsedInput.contactNoteId),
        eq(contactNoteModel.contactId, contact.id),
      ),
    )
}
