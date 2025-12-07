"use server"

import { FieldType, prisma } from "@aha.chat/database"
import { FieldOperationType } from "@aha.chat/flow-config"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactCustomFieldRequest,
  addContactCustomFieldRequest,
} from "../schemas/contact-custom-field"

export const addContactCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactCustomFieldRequest
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

      await prisma.$transaction(async (tx) => {
        const customField = await tx.field.findFirstOrThrow({
          where: {
            id: parsedInput.customFieldId,
            fieldType: FieldType.customField,
          },
        })

        await Promise.all(
          contacts.map(async (contact) => {
            const contactCustomField = await tx.contactCustomField.findFirst({
              where: {
                contactId: contact.id,
                customFieldId: customField.id,
              },
            })

            if (contactCustomField) {
              let value = ""
              switch (parsedInput.operation) {
                case FieldOperationType.append:
                  value = contactCustomField.value + String(parsedInput.value)
                  break
                case FieldOperationType.prepend:
                  value = String(parsedInput.value) + contactCustomField.value
                  break
                case FieldOperationType.increase:
                  value = String(
                    Number(contactCustomField.value) +
                      Number(parsedInput.value),
                  )
                  break
                case FieldOperationType.decrease:
                  value = String(
                    Number(contactCustomField.value) -
                      Number(parsedInput.value),
                  )
                  break
                default:
                  value = parsedInput.value as string
              }

              return tx.contactCustomField.update({
                where: {
                  id: contactCustomField.id,
                },
                data: {
                  value,
                },
              })
            }
            return tx.contactCustomField.create({
              data: {
                contactId: contact.id,
                customFieldId: customField.id,
                value: parsedInput.value as string,
              },
            })
          }),
        )
      })

      revalidateCacheTags(`chatbots:${chatbotId}#contacts`)
    },
  )
