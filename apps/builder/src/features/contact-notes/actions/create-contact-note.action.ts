"use server"

import { prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
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
      await prisma.contact.findFirstOrThrow({
        where: {
          chatbotId,
          id,
        },
      })

      return await prisma.contactNote.create({
        data: {
          contactId: id,
          content: parsedInput.content,
          createdById: ctx.user.id,
        },
      })
    },
  )
