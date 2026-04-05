"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel, contactNoteModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateContactNoteRequest,
  updateContactNoteRequest,
} from "../schemas/action"

export const editContactNoteAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateContactNoteRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await editContactNote({ workspaceId, id }, parsedInput)
  })

export const editContactNote = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateContactNoteRequest,
) => {
  const contact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Contact not found",
  })

  const foundContactNote = await findOrFail({
    table: contactNoteModel,
    where: {
      contactId: contact.id,
      id: parsedInput.contactNoteId,
    },
    message: "Contact note not found",
  })

  const updatedContactNote = await db
    .update(contactNoteModel)
    .set({
      text: parsedInput.text,
    })
    .where(eq(contactNoteModel.id, foundContactNote.id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#contacts`)
  return updatedContactNote
}
