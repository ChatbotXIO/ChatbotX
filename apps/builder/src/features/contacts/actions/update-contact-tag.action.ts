"use server"

import { contactService, tagSyncService } from "@chatbotx.io/business"
import { and, db, eq, isNull, notInArray } from "@chatbotx.io/database/client"
import { contactsToTagsModel, tagModel } from "@chatbotx.io/database/schema"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import type { TagResource } from "@/features/tags/schema/resource"
import { logger } from "@/lib/log"
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => await updateContactTags({ workspaceId, parsedInput }),
  )

export const updateContactTags = async ({
  workspaceId,
  parsedInput,
}: {
  workspaceId: string
  parsedInput: UpdateContactTagRequest
}): Promise<TagResource[]> => {
  const contact = await contactService.findByIdOrFail({
    workspaceId,
    id: parsedInput.contactId,
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

  const { returnedTags, newlyAppliedTags, removedTagIds } =
    await db.transaction(async (tx) => {
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
            where: isNull(tagModel.deletedAt),
          })
      }

      const tags = await tx.query.tagModel.findMany({
        where: {
          workspaceId,
          deletedAt: { isNull: true as const },
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
      }

      // Remove tags no longer selected (local ContactToTag only).
      const newTagIdSet = new Set(tags.map((t) => t.id))
      const removedTagIds = Array.from(oldTagIds).filter(
        (id) => !newTagIdSet.has(id),
      )
      if (removedTagIds.length > 0) {
        await tx.delete(contactsToTagsModel).where(
          tags.length > 0
            ? and(
                eq(contactsToTagsModel.contactId, contact.id),
                notInArray(
                  contactsToTagsModel.tagId,
                  tags.map((t) => t.id),
                ),
              )
            : eq(contactsToTagsModel.contactId, contact.id),
        )
      }

      const newlyAppliedTags = tags.filter((tag) => !oldTagIds.has(tag.id))

      return {
        returnedTags: tags,
        newlyAppliedTags,
        removedTagIds,
      }
    })

  // Emit tagApplied for newly added tags + enqueue sync
  for (const tag of newlyAppliedTags) {
    try {
      await emitTagApplied(workspaceId, contact.id, tag.id)
    } catch (error) {
      logger.error({ err: error }, "Failed to emit tagApplied event:")
    }

    await tagSyncService.enqueueAttach({
      workspaceId,
      contactId: contact.id,
      tagId: tag.id,
    })
  }

  // Emit tagRemoved + enqueue channel cleanup for removed tags.
  for (const tagId of removedTagIds) {
    try {
      await emitTagRemoved(workspaceId, contact.id, tagId)
    } catch (error) {
      logger.error({ err: error }, "Failed to emit tagRemoved event:")
    }

    await tagSyncService.enqueueDetach({
      workspaceId,
      contactId: contact.id,
      tagId,
    })
  }

  await invalidateCacheByTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])

  return returnedTags
}
