"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteContactNoteRequest,
  deleteContactNoteRequest,
} from "../schemas/action"

export const deleteContactNoteAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteContactNoteRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteContactNoteRequest
    }) => {
      assertCurrentUserCanAccessChatbot(chatbotId)

      return await prisma.contactNote.delete({
        where: {
          id: parsedInput.id,
        },
      })
    },
  )
