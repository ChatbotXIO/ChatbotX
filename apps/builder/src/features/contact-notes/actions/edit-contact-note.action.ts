"use server"

import { prisma } from "@aha.chat/database"
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
      const contact = await prisma.contact.findFirstOrThrow({
        select: {
          id: true,
        },
        where: {
          chatbotId,
          id,
        },
      })

      return await prisma.contactNote.update({
        where: {
          id: parsedInput.contactNoteId,
          contactId: contact.id,
        },
        data: {
          content: parsedInput.content,
        },
      })
    },
  )
