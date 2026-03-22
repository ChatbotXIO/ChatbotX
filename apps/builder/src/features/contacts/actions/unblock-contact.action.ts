"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const unblockContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const existingContact = await findOrFail<ContactModel>(
        contactModel,
        {
          chatbotId,
          id,
        },
        "Contact not found",
      )

      const contact = await db
        .update(contactModel)
        .set({
          blockedAt: null,
        })
        .where(eq(contactModel.id, existingContact.id))
        .returning()
        .then((result) => result[0])

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])

      await integrationQueue.add(IntegrationJobAction.unblockContact, {
        type: IntegrationJobAction.unblockContact,
        data: {
          contact,
        },
      })
    },
  )
