"use server"

import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "@aha.chat/database/schema"
import {
  type CustomFieldModel,
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
  type DeleteContactCustomFieldsRequest,
  deleteContactCustomFieldsRequest,
} from "../schemas/contact-custom-field"

export const deleteContactCustomFieldAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteContactCustomFieldsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteContactCustomFieldsRequest
    }) => {
      await deleteContactCustomFields({
        chatbotId,
        contactIds: parsedInput.ids,
        customFieldId: parsedInput.customFieldId,
      })
    },
  )

export const deleteContactCustomFields = async ({
  chatbotId,
  contactIds,
  customFieldId,
}: {
  chatbotId: string
  contactIds: string[]
  customFieldId: string
}) => {
  const contacts = await db.query.contactModel.findMany({
    where: {
      chatbotId,
      id: {
        in: contactIds,
      },
    },
    columns: {
      id: true,
    },
  })
  if (contacts.length === 0) {
    return
  }

  if (isCuid(customFieldId)) {
    const customField = await findOrFail<CustomFieldModel>(
      customFieldModel,
      {
        chatbotId,
        id: customFieldId,
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
    fillableContactKeys.includes(customFieldId as FillableContactKeys)
  ) {
    await db
      .update(contactModel)
      .set({
        [customFieldId]: "",
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
}
