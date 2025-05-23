"use server"

import {
  chatbotIdAndIdRequestParams,
  type ChatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  updateContactRequest,
  type UpdateContactRequest,
} from "../schemas/update-contact.request"
import { prisma } from "@ahachat.ai/database"
import { ContactException } from "../schemas/types"

export const updateContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateContactRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateContactRequest
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

      console.log("parsedInput", parsedInput)
    },
  )
