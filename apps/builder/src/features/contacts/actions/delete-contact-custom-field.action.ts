"use server"

import { FieldType, prisma } from "@aha.chat/database"
import {
  type FillableContactKeys,
  fillableContactKeys,
} from "@aha.chat/database/types"
import { isCuid } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteContactCustomFieldRequest,
  deleteContactCustomFieldRequest,
} from "../schemas/contact-custom-field"

export const deleteContactCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteContactCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteContactCustomFieldRequest
    }) => {
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
      if (isCuid(parsedInput.customFieldId)) {
        const customField = await prisma.field.findFirstOrThrow({
          where: {
            chatbotId,
            id: parsedInput.customFieldId,
            fieldType: FieldType.customField,
          },
        })

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
      } else if (
        fillableContactKeys.includes(
          parsedInput.customFieldId as FillableContactKeys,
        )
      ) {
        await prisma.contact.updateMany({
          where: {
            chatbotId,
            id: {
              in: contacts.map((c) => c.id),
            },
          },
          data: {
            [parsedInput.customFieldId]: "",
          },
        })
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#fields`,
      ])
    },
  )
