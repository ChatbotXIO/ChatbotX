"use server"

import { and, db, eq, findOrFail, notInArray } from "@aha.chat/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import { emitTagApplied, emitTagRemoved } from "@chatbotx/events"
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

  // Get old tags before update
  const oldTags = await db.query.contactsToTagsModel.findMany({
    where: {
      contactId: contact.id,
    },
    columns: {
      tagId: true,
    },
  })
  const oldTagIds = new Set(oldTags.map((t) => t.tagId))

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

  // Emit tag events based on changes
  const newTagIds = new Set(returnedTags.map((t) => t.id))
  const newlyAppliedTags = returnedTags.filter((tag) => !oldTagIds.has(tag.id))
  const removedTagIds = Array.from(oldTagIds).filter((id) => !newTagIds.has(id))

  // Emit tagApplied for newly added tags
  for (const tag of newlyAppliedTags) {
    try {
      await emitTagApplied(chatbotId, contact.id, tag.id)
    } catch (error) {
      console.error("Failed to emit tagApplied event:", error)
    }
  }

  // Emit tagRemoved for removed tags
  for (const tagId of removedTagIds) {
    try {
      await emitTagRemoved(chatbotId, contact.id, tagId)
    } catch (error) {
      console.error("Failed to emit tagRemoved event:", error)
    }
  }

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
    `chatbots:${chatbotId}#tags`,
  ])

  return returnedTags
}
