"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { FieldType, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  clearContactCustomFieldRequest,
  type ClearContactCustomFieldRequest,
} from "../schemas/clear-contact-custom-field.request"

export const clearContactCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
          fieldType: FieldType.CUSTOM_FIELD,
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
      if (contacts.length === 0) return

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

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
      revalidateTag(`chatbots:${chatbotId}#tags`)
    },
  )
