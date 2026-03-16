"use server"

import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "@aha.chat/database/schema"
import {
  type ContactModel,
  type FillableContactKeys,
  fillableContactKeys,
} from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
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
  chatbotId: string
  id: string
  parsedInput: UpdateContactFieldRequest
}) => {
  const contact = await findOrFail<ContactModel>(
    contactModel,
    {
      chatbotId,
      id,
    },
    "Contact not found",
  )

  const customFieldIds = Object.keys(parsedInput).filter(
    (key) => !fillableContactKeys.includes(key as FillableContactKeys),
  )

  const allCustomFields =
    customFieldIds.length > 0
      ? await db
          .select()
          .from(customFieldModel)
          .where(
            and(
              eq(customFieldModel.chatbotId, chatbotId),
              inArray(customFieldModel.id, customFieldIds),
            ),
          )
      : []

  const allCustomFieldsMap = new Map(
    allCustomFields.map((field) => [field.id, field]),
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
      await tx
        .insert(contactCustomFieldModel)
        .values(
          Object.entries(customFields).map(([key, value]) => ({
            contactId: contact.id,
            customFieldId: key,
            value: value as string,
            id: createId(),
          })),
        )
        .onConflictDoUpdate({
          target: [
            contactCustomFieldModel.contactId,
            contactCustomFieldModel.customFieldId,
          ],
          set: {
            value: sql`excluded.value`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    }
  })
}
