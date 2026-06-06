"use server"

import { contactService, tagSyncService } from "@chatbotx.io/business"
import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  isNull,
} from "@chatbotx.io/database/client"
import { contactsToTagsModel, tagModel } from "@chatbotx.io/database/schema"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schemas/contact-tag"

const CONTACT_CHUNK_SIZE = 200

export const addContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: AddContactTagRequest
    }) => {
      await addContactTags({
        workspaceId,
        parsedInput,
      })
    },
  )

export const addContactTags = async ({
  workspaceId,
  parsedInput,
}: {
  workspaceId: string
  parsedInput: AddContactTagRequest
}) => {
  if (parsedInput.ids.length === 0 || parsedInput.tags.length === 0) {
    return
  }

  // Resolve/create the tag set once (bounded by the request, small).
  const allTags = await db.transaction(async (tx) => {
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

    return await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: parsedInput.tags },
      },
      columns: {
        id: true,
      },
    })
  })
  if (allTags.length === 0) {
    return
  }

  // Process selected contacts in chunks — never load all contacts at once.
  for (let i = 0; i < parsedInput.ids.length; i += CONTACT_CHUNK_SIZE) {
    const idChunk = parsedInput.ids.slice(i, i + CONTACT_CHUNK_SIZE)
    const contacts = await db.query.contactModel.findMany({
      where: {
        workspaceId,
        id: { in: idChunk },
      },
      columns: {
        id: true,
      },
    })
    if (contacts.length === 0) {
      continue
    }

    const links = contacts.flatMap((contact) =>
      allTags.map((selectedTag) => ({
        contactId: contact.id,
        tagId: selectedTag.id,
      })),
    )
    // RETURNING from ON CONFLICT DO NOTHING returns only newly-inserted rows.
    const newlyLinkedPairs = await db
      .insert(contactsToTagsModel)
      .values(links)
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })

    // Emit tag applied for all attempted pairs (existing callers depend on it).
    for (const contact of contacts) {
      for (const tag of allTags) {
        try {
          await emitTagApplied(workspaceId, contact.id, tag.id)
        } catch (error) {
          logger.error({ err: error }, "Failed to emit tagApplied event:")
        }
      }
    }
    // Channel sync only for newly attached pairs.
    for (const pair of newlyLinkedPairs) {
      await tagSyncService.enqueueAttach({
        workspaceId,
        contactId: pair.contactId,
        tagId: pair.tagId,
      })
    }
  }

  await invalidateCacheByTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])
}

export const attachContactTag = async ({
  workspaceId,
  contactId,
  tagId,
}: {
  workspaceId: string
  contactId: string
  tagId: string
}) => {
  await contactService.findByIdOrFail({ workspaceId, id: contactId })
  await findOrFail({
    table: tagModel,
    where: { id: tagId, workspaceId, deletedAt: { isNull: true as const } },
  })

  const inserted = await db
    .insert(contactsToTagsModel)
    .values({
      contactId,
      tagId,
    })
    .onConflictDoNothing({
      target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
    })
    .returning({ contactId: contactsToTagsModel.contactId })

  // Emit tag applied event
  try {
    await emitTagApplied(workspaceId, contactId, tagId)
  } catch (error) {
    logger.error({ err: error }, "Failed to emit tagApplied event:")
  }
  // Channel sync only when row was newly inserted.
  if (inserted.length > 0) {
    await tagSyncService.enqueueAttach({ workspaceId, contactId, tagId })
  }
}

export const detachContactTag = async ({
  workspaceId,
  contactId,
  tagId,
}: {
  workspaceId: string
  contactId: string
  tagId: string
}) => {
  await contactService.findByIdOrFail({ workspaceId, id: contactId })
  await findOrFail({
    table: tagModel,
    where: { id: tagId, workspaceId, deletedAt: { isNull: true as const } },
  })

  await db
    .delete(contactsToTagsModel)
    .where(
      and(
        eq(contactsToTagsModel.contactId, contactId),
        eq(contactsToTagsModel.tagId, tagId),
      ),
    )

  // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
  await tagSyncService.enqueueDetach({ workspaceId, contactId, tagId })

  // Emit tag removed event
  try {
    await emitTagRemoved(workspaceId, contactId, tagId)
  } catch (error) {
    logger.error({ err: error }, "Failed to emit tagRemoved event:")
  }
}

export const attachContactTags = async ({
  workspaceId,
  contactId,
  tagIds,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
}) => {
  await contactService.findByIdOrFail({ workspaceId, id: contactId })

  const tags = await db.query.tagModel.findMany({
    where: {
      workspaceId,
      id: { in: tagIds },
      deletedAt: { isNull: true as const },
    },
    columns: { id: true },
  })

  if (tags.length > 0) {
    await db
      .insert(contactsToTagsModel)
      .values(tags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })

    for (const tag of tags) {
      await emitTagApplied(workspaceId, contactId, tag.id)
    }
  }
}

export const detachContactTags = async ({
  workspaceId,
  contactId,
  tagIds,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
}) => {
  await contactService.findByIdOrFail({ workspaceId, id: contactId })

  await db
    .delete(contactsToTagsModel)
    .where(
      and(
        eq(contactsToTagsModel.contactId, contactId),
        inArray(contactsToTagsModel.tagId, tagIds),
      ),
    )

  for (const tagId of tagIds) {
    await emitTagRemoved(workspaceId, contactId, tagId)
  }
}
