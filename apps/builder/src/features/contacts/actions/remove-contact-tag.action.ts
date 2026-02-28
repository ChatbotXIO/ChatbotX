"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { contactsToTagsModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactTagRequest,
  removeContactTagRequest,
} from "../schemas/contact-tag"

export const removeContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(removeContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactTagRequest
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

      await db.transaction(async (tx) => {
        const allTags = await tx.query.tagModel.findMany({
          where: {
            chatbotId,
            name: {
              in: parsedInput.tags,
            },
          },
          columns: {
            id: true,
          },
        })

        const allTagIds = allTags.map((tag) => tag.id)

        for (const contact of contacts) {
          await tx
            .delete(contactsToTagsModel)
            .where(
              and(
                eq(contactsToTagsModel.contactId, contact.id),
                inArray(contactsToTagsModel.tagId, allTagIds),
              ),
            )
        }
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])
    },
  )
