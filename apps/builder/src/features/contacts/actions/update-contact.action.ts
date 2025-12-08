"use server"

import { prisma } from "@aha.chat/database"
import {
  type ContactModel,
  type FillableContactKeys,
  fillableContactKeys,
} from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { maxPerPageString } from "@/lib/shared-request"
import {
  type UpdateContactRequest,
  updateContactRequest,
} from "../schemas/action"
import { ContactException } from "../schemas/resource"

export const updateContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateContactRequest)
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

      const allCustomFields = await listCustomFields({
        chatbotId,
        ...listCustomFieldsSearchParams.parse({
          chatbotId,
          perPage: maxPerPageString,
        }),
      })
      const allCustomFieldsMap = new Map(
        allCustomFields.data.map((field) => [field.id, field]),
      )

      // Prepare data
      const contactFields: Partial<ContactModel> = {}
      const customFields: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(parsedInput)) {
        if (fillableContactKeys.includes(key as FillableContactKeys)) {
          // biome-ignore lint/suspicious/noExplicitAny: we know the key is a valid field
          ;(contactFields as any)[key] = value
        } else if (allCustomFieldsMap.has(key)) {
          customFields[key] = value
        }
      }

      await prisma.$transaction(async (tx) => {
        if (Object.keys(contactFields).length > 0) {
          await tx.contact.update({
            where: {
              id,
            },
            data: contactFields,
          })
        }

        if (Object.keys(customFields).length > 0) {
          for (const [key, value] of Object.entries(customFields)) {
            await tx.contactCustomField.upsert({
              where: {
                contactId_customFieldId: {
                  contactId: id,
                  customFieldId: key,
                },
              },
              create: {
                contactId: id,
                customFieldId: key,
                value: value as string,
              },
              update: {
                value: value as string,
              },
            })
          }
        }
      })
    },
  )
