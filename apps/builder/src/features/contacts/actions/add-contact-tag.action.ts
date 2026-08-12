"use server"

import {
  adsConversionService,
  type ContactAccessScope,
  contactService,
  tagService,
  tagSyncService,
} from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { contactsToTagsModel, tagModel } from "@chatbotx.io/database/schema"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
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
      const accessScope = await requireContactPermissionScope(workspaceId)
      await addContactTags({
        workspaceId,
        parsedInput,
        accessScope,
      })
    },
  )

export const addContactTags = async ({
  workspaceId,
  parsedInput,
  accessScope,
}: {
  workspaceId: string
  parsedInput: AddContactTagRequest
  accessScope?: ContactAccessScope
}) => {
  if (parsedInput.ids.length === 0 || parsedInput.tags.length === 0) {
    return
  }

  // Resolve/create the tag set once (bounded by the request, small).
  const allTags = await tagService.upsertByNames({
    workspaceId,
    names: parsedInput.tags,
  })
  if (allTags.length === 0) {
    return
  }

  // Process selected contacts in chunks — never load all contacts at once.
  for (let i = 0; i < parsedInput.ids.length; i += CONTACT_CHUNK_SIZE) {
    const idChunk = parsedInput.ids.slice(i, i + CONTACT_CHUNK_SIZE)
    const contacts = await contactService.findManyByIds({
      workspaceId,
      ids: idChunk,
      accessScope,
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
    // Channel sync + ads conversion `tagApplied` trigger only for newly
    // attached pairs (not every attempted pair, unlike the emit loop above).
    for (const pair of newlyLinkedPairs) {
      await tagSyncService.enqueueAttach({
        workspaceId,
        contactId: pair.contactId,
        tagId: pair.tagId,
      })
    }
    // One batch resolve+enqueue call per chunk instead of one per pair
    // (HIGH-1).
    if (newlyLinkedPairs.length > 0) {
      await adsConversionService.enqueueTagAppliedEvaluationsBulk({
        workspaceId,
        pairs: newlyLinkedPairs.map((pair) => ({
          contactId: pair.contactId,
          tagId: pair.tagId,
        })),
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
  accessScope,
}: {
  workspaceId: string
  contactId: string
  tagId: string
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })
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
  // Channel sync + ads conversion `tagApplied` trigger only when the row was
  // newly inserted.
  if (inserted.length > 0) {
    await tagSyncService.enqueueAttach({ workspaceId, contactId, tagId })
    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId,
      contactId,
      tagId,
    })
  }
}

export const detachContactTag = async ({
  workspaceId,
  contactId,
  tagId,
  accessScope,
}: {
  workspaceId: string
  contactId: string
  tagId: string
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })
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
  accessScope,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

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
  accessScope,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

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
