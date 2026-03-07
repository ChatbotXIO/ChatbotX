"use server"

import { and, db, eq, findOrFail, notInArray } from "@aha.chat/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import type { TagResource } from "@/features/tags/schemas/resource"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

export const updateContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => {
      return await updateContactTags({ chatbotId, parsedInput })
    },
  )

export const updateContactTags = async ({
  chatbotId,
  parsedInput,
}: {
  chatbotId: string
  parsedInput: UpdateContactTagRequest
}): Promise<TagResource[]> => {
  const contact = await findOrFail<ContactModel>(
    contactModel,
    {
      id: parsedInput.contactId,
      chatbotId,
    },
    "Contact not found",
  )

  const returnedTags = await db.transaction(async (tx) => {
    if (parsedInput.tags.length > 0) {
      await tx
        .insert(tagModel)
        .values(
          parsedInput.tags.map((name) => ({
            id: createId(),
            name,
            chatbotId,
          })),
        )
        .onConflictDoNothing({
          target: [tagModel.chatbotId, tagModel.name],
        })
    }

    const tags = await tx.query.tagModel.findMany({
      where: {
        chatbotId,
        name: { in: parsedInput.tags },
      },
    })

    if (tags.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(
          tags.map((selectedTag) => ({
            contactId: contact.id,
            tagId: selectedTag.id,
          })),
        )
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })

      await tx.delete(contactsToTagsModel).where(
        and(
          eq(contactsToTagsModel.contactId, contact.id),
          notInArray(
            contactsToTagsModel.tagId,
            tags.map((t) => t.id),
          ),
        ),
      )
    }

    return tags
  })

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
    `chatbots:${chatbotId}#tags`,
  ])

  return returnedTags
}
