"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { contactModel, contactNoteModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddContactNoteRequest,
  addContactNoteRequest,
} from "../schemas/action"

export const createContactNoteAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(addContactNoteRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
      ctx: { user },
    } = props

    return await createContactNote(
      { workspaceId, id, userId: (user as UserModel).id },
      parsedInput,
    )
  })

export const createContactNote = async (
  ctx: { workspaceId: string; id: string; userId: string },
  parsedInput: AddContactNoteRequest,
) => {
  // Make sure contact exists in the workspace
  const contact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Contact not found",
  })

  return await db
    .insert(contactNoteModel)
    .values({
      id: createId(),
      contactId: contact.id,
      text: parsedInput.text,
      createdById: ctx.userId,
    })
    .returning()
    .then((result) => result[0])
}
