"use server"

import { FieldType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type ClearContactCustomFieldRequest,
  clearContactCustomFieldRequest,
} from "../schemas/clear-contact-custom-field.request"

export const clearContactCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(clearContactCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: ClearContactCustomFieldRequest
    }) => {
      const customField = await prisma.field.findFirstOrThrow({
        where: {
          chatbotId,
          id: parsedInput.customFieldId,
          fieldType: FieldType.customField,
        },
      })

      const contacts = await prisma.contact.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        select: {
          id: true,
        },
      })
      if (contacts.length === 0) {
        return
      }

      await prisma.$transaction(async (tx) => {
        await tx.contactCustomField.deleteMany({
          where: {
            contactId: {
              in: contacts.map((c) => c.id),
            },
            customFieldId: customField.id,
          },
        })
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#fields`,
      ])
    },
  )
