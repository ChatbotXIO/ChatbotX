"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteContactNoteRequest,
  deleteContactNoteRequest,
} from "../schemas/action"

export const deleteContactNoteAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(deleteContactNoteRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: DeleteContactNoteRequest
    }) => {
      const contact = await prisma.contact.findFirstOrThrow({
        where: {
          chatbotId,
          id,
        },
      })

      return await prisma.contactNote.delete({
        where: {
          id: parsedInput.id,
          contactId: contact.id,
        },
      })
    },
  )
