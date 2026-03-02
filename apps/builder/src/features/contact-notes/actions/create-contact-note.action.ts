"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import { contactModel, contactNoteModel } from "@aha.chat/database/schema"
import type { ContactModel, UserModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactNoteRequest,
  addContactNoteRequest,
} from "../schemas/action"

export const createContactNoteAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(addContactNoteRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: AddContactNoteRequest
    }) => {
      // Make sure contact exists in the chatbot
      const contact = await findOrFail<ContactModel>(
        contactModel,
        {
          chatbotId,
          id,
        },
        "Contact not found",
      )

      return await db
        .insert(contactNoteModel)
        .values({
          id: createId(),
          contactId: contact.id,
          content: parsedInput.content,
          createdById: ctx.user.id,
        })
        .returning()
        .then((result) => result[0])
    },
  )
