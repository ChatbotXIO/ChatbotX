"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { contactModel, contactNoteModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
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
      const contact = await findOrFail(
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
          text: parsedInput.text,
          createdById: ctx.user.id,
        })
        .returning()
        .then((result) => result[0])
    },
  )
