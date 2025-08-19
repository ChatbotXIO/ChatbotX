"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { ContactException } from "../schemas"
import {
  updateContactRequest,
  // type UpdateContactRequest,
} from "../schemas/update-contact.request"

export const updateContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(updateContactRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      // parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      // parsedInput: UpdateContactRequest
    }) => {
      const contact = await prisma.contact.findFirst({
        where: {
          chatbotId,
          id,
        },
      })
      if (!contact) {
        throw new ContactException("Contact was not found")
      }
    },
  )
