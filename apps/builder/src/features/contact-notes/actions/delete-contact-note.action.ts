"use server"

import { type ContactAccessScope, contactService } from "@chatbotx.io/business"
import { and, db, eq } from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
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
    const accessScope = await requireContactPermissionScope(workspaceId)

    await deleteContactNote({ workspaceId, id, accessScope }, parsedInput)
  })

export const deleteContactNote = async (
  ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  },
  parsedInput: DeleteContactNoteRequest,
) => {
  const contact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    accessScope: ctx.accessScope,
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
