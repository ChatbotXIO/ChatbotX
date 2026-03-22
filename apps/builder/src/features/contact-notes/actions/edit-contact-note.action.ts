"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { contactModel, contactNoteModel } from "@aha.chat/database/schema"
import type { ContactModel, ContactNoteModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactNoteRequest,
  updateContactNoteRequest,
} from "../schemas/action"

export const editContactNoteAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateContactNoteRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateContactNoteRequest
    }) => {
      const contact = await findOrFail<ContactModel>(
        contactModel,
        {
          chatbotId,
          id,
        },
        "Contact not found",
      )

      const foundContactNote = await findOrFail<ContactNoteModel>(
        contactNoteModel,
        {
          contactId: contact.id,
          id: parsedInput.contactNoteId,
        },
        "Contact note not found",
      )

      return await db
        .update(contactNoteModel)
        .set({
          content: parsedInput.content,
        })
        .where(eq(contactNoteModel.id, foundContactNote.id))
        .returning()
        .then((result) => result[0])
    },
  )
