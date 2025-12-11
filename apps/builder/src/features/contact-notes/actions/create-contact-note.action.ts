"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserId,
} from "@/lib/auth/utils"
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
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: AddContactNoteRequest
    }) => {
      assertCurrentUserCanAccessChatbot(chatbotId)

      // Make sure contact exists in the chatbot
      await prisma.contact.findFirstOrThrow({
        where: {
          chatbotId,
          id,
        },
      })

      const userId = await getCurrentUserId()

      return await prisma.contactNote.create({
        data: {
          contactId: id,
          content: parsedInput.content,
          createdById: userId,
        },
      })
    },
  )
