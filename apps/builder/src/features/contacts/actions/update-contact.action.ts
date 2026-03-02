"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
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
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { maxPerPageString } from "@/lib/shared-request"
import {
  type UpdateContactRequest,
  updateContactRequest,
} from "../schemas/action"

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
      const contact = await findOrFail<ContactModel>(
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
                customFieldId: key,
                value: value as string,
                id: createId(),
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
    },
  )
