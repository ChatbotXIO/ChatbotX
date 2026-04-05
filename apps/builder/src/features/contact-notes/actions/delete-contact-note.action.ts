"use server"

import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel, contactNoteModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
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
  const contact = await findOrFail({
    table: contactModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Contact note not found",
  })

  await db
    .delete(contactNoteModel)
    .where(
      and(
        eq(contactNoteModel.id, parsedInput.contactNoteId),
        eq(contactNoteModel.contactId, contact.id),
      ),
    )

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#contacts`)
}
