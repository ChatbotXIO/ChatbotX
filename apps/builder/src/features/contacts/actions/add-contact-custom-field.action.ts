"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { contactCustomFieldModel, fieldModel } from "@aha.chat/database/schema"
import type { FieldModel } from "@aha.chat/database/types"
import { FieldOperationType } from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
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
      await addContactCustomFields({
        bindArgsParsedInputs: [chatbotId],
        parsedInput,
      })
    },
  )

export const addContactCustomFields = async ({
  bindArgsParsedInputs: [chatbotId],
  parsedInput,
}: {
  bindArgsParsedInputs: ChatbotIdRequestParams
  parsedInput: AddContactCustomFieldRequest
}) => {
  const contacts = await db.query.contactModel.findMany({
    where: {
      chatbotId,
      id: {
        in: parsedInput.ids,
      },
    },
    columns: {
      id: true,
    },
  })
  if (contacts.length === 0) {
    return
  }

  const customField = await findOrFail<FieldModel>(
    fieldModel,
    {
      chatbotId,
      id: parsedInput.customFieldId,
      fieldType: "customField",
    },
    "Custom field not found",
  )

  await db.transaction(async (tx) => {
    await Promise.all(
      contacts.map(async (contact) => {
        const contactCustomField =
          await tx.query.contactCustomFieldModel.findFirst({
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
                Number(contactCustomField.value) + Number(parsedInput.value),
              )
              break
            case FieldOperationType.decrease:
              value = String(
                Number(contactCustomField.value) - Number(parsedInput.value),
              )
              break
            default:
              value = parsedInput.value as string
          }

          return tx
            .update(contactCustomFieldModel)
            .set({
              value,
            })
            .where(eq(contactCustomFieldModel.id, contactCustomField.id))
        }

        return tx.insert(contactCustomFieldModel).values({
          contactId: contact.id,
          customFieldId: customField.id,
          value: parsedInput.value as string,
          id: createId(),
        })
      }),
    )
  })

  revalidateCacheTags(`chatbots:${chatbotId}#contacts`)
}

export const setContactCustomFieldValue = async ({
  chatbotId,
  contactId,
  customFieldId,
  value,
}: {
  chatbotId: string
  contactId: string
  customFieldId: string
  value: string
}) => {
  const contactCustomField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId,
      customFieldId,
    },
  })

  if (contactCustomField) {
    await db
      .update(contactCustomFieldModel)
      .set({
        value,
      })
      .where(eq(contactCustomFieldModel.id, contactCustomField.id))
  } else {
    await db.insert(contactCustomFieldModel).values({
      contactId,
      customFieldId,
      value,
      id: createId(),
    })
  }

  revalidateCacheTags(`chatbots:${chatbotId}#contacts`)
}
