import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactNotesRequest,
  addContactNotesRequest,
} from "../schemas/action"

export const createContactNotesAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactNotesRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactNotesRequest
    }) => {
      assertCurrentUserCanAccessChatbot(chatbotId)

      // Make sure contact exists in the chatbot
      await prisma.contact.findFirstOrThrow({
        where: {
          chatbotId,
          id: parsedInput.contactId,
        },
      })

      await prisma.contactNote.create({
        data: parsedInput,
      })
    },
  )
