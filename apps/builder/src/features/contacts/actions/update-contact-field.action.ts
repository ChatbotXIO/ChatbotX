"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactModel,
} from "@chatbotx.io/database/schema"
import {
  type ContactModel,
  type FillableContactKeys,
  fillableContactKeys,
} from "@chatbotx.io/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"
import { chatbotActionClient } from "@/lib/safe-action"
import { maxPerPageString } from "@/lib/shared-request"
import {
  type UpdateContactFieldRequest,
  updateContactFieldRequest,
} from "../schemas/action"

export const updateContactFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateContactFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateContactFieldRequest
    }) => {
      await updateContactFields({ chatbotId, id, parsedInput })
    },
  )

export const updateContactFields = async ({
  chatbotId,
  id,
  parsedInput,
}: {
  chatbotId: bigint
  id: bigint
  parsedInput: UpdateContactFieldRequest
}) => {
  const contact = await findOrFail(
    contactModel,
    {
      chatbotId,
      id,
    },
    "Contact not found",
  )

  const allCustomFields = await listCustomFields({
    chatbotId,
    ...listCustomFieldsSearchParams.parse({
      perPage: maxPerPageString,
    }),
  })
  const allCustomFieldsMap = new Map(
    allCustomFields.data.map((field) => [field.id.toString(), field]),
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

  await db.transaction(async (tx) => {
    if (Object.keys(contactFields).length > 0) {
      await tx
        .update(contactModel)
        .set(contactFields)
        .where(eq(contactModel.id, contact.id))
    }

    if (Object.keys(customFields).length > 0) {
      for (const [key, value] of Object.entries(customFields)) {
        await tx
          .insert(contactCustomFieldModel)
          .values({
            contactId: id,
            customFieldId: BigInt(key),
            value: value as string,
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: {
              value: value as string,
            },
          })
      }
    }
  })
}
