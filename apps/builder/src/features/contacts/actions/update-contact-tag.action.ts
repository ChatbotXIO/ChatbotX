"use server"

import { emitTagApplied, emitTagRemoved } from "@chatbotx/events"
import {
  and,
  db,
  eq,
  findOrFail,
  notInArray,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import type { TagResource } from "@/features/tags/schema/resource"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

export const updateContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => {
      return await updateContactTags({ workspaceId, parsedInput })
    },
  )

export const updateContactTags = async ({
  workspaceId,
  parsedInput,
}: {
  workspaceId: string
  parsedInput: UpdateContactTagRequest
}): Promise<TagResource[]> => {
  const contact = await findOrFail({
    table: contactModel,
    where: {
      id: parsedInput.contactId,
      workspaceId,
    },
    message: "Contact not found",
  })

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
            workspaceId,
          })),
        )
        .onConflictDoNothing({
          target: [tagModel.workspaceId, tagModel.name],
        })
    }

    const tags = await tx.query.tagModel.findMany({
      where: {
        workspaceId,
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
      await emitTagApplied(workspaceId, contact.id, tag.id)
    } catch (error) {
      console.error("Failed to emit tagApplied event:", error)
    }
  }

  // Emit tagRemoved for removed tags
  for (const tagId of removedTagIds) {
    try {
      await emitTagRemoved(workspaceId, contact.id, tagId)
    } catch (error) {
      console.error("Failed to emit tagRemoved event:", error)
    }
  }

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])

  return returnedTags
}
