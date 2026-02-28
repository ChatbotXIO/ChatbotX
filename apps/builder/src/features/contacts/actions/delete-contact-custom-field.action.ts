"use server"

import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  fieldModel,
} from "@aha.chat/database/schema"
import {
  type FieldModel,
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

      if (isCuid(parsedInput.customFieldId)) {
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
          await tx.delete(contactCustomFieldModel).where(
            and(
              inArray(
                contactCustomFieldModel.contactId,
                contacts.map((c) => c.id),
              ),
              eq(contactCustomFieldModel.customFieldId, customField.id),
            ),
          )
        })
      } else if (
        fillableContactKeys.includes(
          parsedInput.customFieldId as FillableContactKeys,
        )
      ) {
        await db
          .update(contactModel)
          .set({
            [parsedInput.customFieldId]: "",
          })
          .where(
            and(
              inArray(
                contactModel.id,
                contacts.map((c) => c.id),
              ),
              eq(contactModel.chatbotId, chatbotId),
            ),
          )
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#fields`,
      ])
    },
  )
