"use server"

import { and, db, eq, findOrFail } from "@aha.chat/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@aha.chat/database/schema"
import type { ContactModel, TagModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schemas/contact-tag"

export const addContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactTagRequest
    }) => {
      await addContactTags({
        chatbotId,
        parsedInput,
      })
    },
  )
export const addContactTags = async ({
  chatbotId,
  parsedInput,
}: {
  chatbotId: string
  parsedInput: AddContactTagRequest
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
    // Create new tags if they don't exist
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

    const allTags = await tx.query.tagModel.findMany({
      where: {
        chatbotId,
        name: { in: parsedInput.tags },
      },
      columns: {
        id: true,
      },
    })

    const links = contacts.flatMap((contact) =>
      allTags.map((selectedTag) => ({
        contactId: contact.id,
        tagId: selectedTag.id,
      })),
    )
    if (links.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(links)
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })
    }
  })

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
    `chatbots:${chatbotId}#tags`,
  ])
}

export const attachContactTag = async ({
  chatbotId,
  contactId,
  tagId,
}: {
  chatbotId: string
  contactId: string
  tagId: string
}) => {
  findOrFail<ContactModel>(contactModel, {
    id: contactId,
    chatbotId,
  })
  findOrFail<TagModel>(tagModel, {
    id: tagId,
    chatbotId,
  })

  await db
    .insert(contactsToTagsModel)
    .values({
      contactId,
      tagId,
    })
    .onConflictDoNothing({
      target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
    })
}

export const detachContactTag = async ({
  chatbotId,
  contactId,
  tagId,
}: {
  chatbotId: string
  contactId: string
  tagId: string
}) => {
  findOrFail<ContactModel>(contactModel, {
    id: contactId,
    chatbotId,
  })
  findOrFail<TagModel>(tagModel, {
    id: tagId,
    chatbotId,
  })

  await db
    .delete(contactsToTagsModel)
    .where(
      and(
        eq(contactsToTagsModel.contactId, contactId),
        eq(contactsToTagsModel.tagId, tagId),
      ),
    )
}
