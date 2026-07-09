"use server"

import { type ContactAccessScope, contactService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
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
    const accessScope = await requireContactPermissionScope(workspaceId)

    return await createContactNote(
      { workspaceId, id, userId: (user as UserModel).id, accessScope },
      parsedInput,
    )
  })

export const createContactNote = async (
  ctx: {
    workspaceId: string
    id: string
    userId: string
    accessScope?: ContactAccessScope
  },
  parsedInput: AddContactNoteRequest,
) => {
  const contact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    accessScope: ctx.accessScope,
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
