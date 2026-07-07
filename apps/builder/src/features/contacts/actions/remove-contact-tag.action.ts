"use server"

import {
  type ContactAccessScope,
  contactService,
  tagSyncService,
} from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactsToTagsModel } from "@chatbotx.io/database/schema"
import { emitTagRemoved } from "@chatbotx.io/events"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type RemoveContactTagsRequest,
  removeContactTagsRequest,
} from "../schemas/contact-tag"

const CONTACT_CHUNK_SIZE = 200

export const removeContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeContactTagsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: RemoveContactTagsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await removeContactTags({
        workspaceId,
        parsedInput,
        accessScope,
      })
    },
  )

export const removeContactTags = async ({
  workspaceId,
  parsedInput,
  accessScope,
}: {
  workspaceId: string
  parsedInput: RemoveContactTagsRequest
  accessScope?: ContactAccessScope
}) => {
  if (parsedInput.ids.length === 0 || parsedInput.tags.length === 0) {
    return
  }

  // parsedInput.ids are contact ids; parsedInput.tags are tag NAMES (the dialog
  // uses TagsInputField + useTagOptions, which emit tag names).
  const allTags = await db.query.tagModel.findMany({
    where: {
      workspaceId,
      deletedAt: { isNull: true as const },
      name: { in: parsedInput.tags },
    },
    columns: {
      id: true,
    },
  })
  const allTagIds = allTags.map((tag) => tag.id)
  if (allTagIds.length === 0) {
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

    for (const contact of contacts) {
      await db
        .delete(contactsToTagsModel)
        .where(
          and(
            eq(contactsToTagsModel.contactId, contact.id),
            inArray(contactsToTagsModel.tagId, allTagIds),
          ),
        )
    }

    // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
    for (const contact of contacts) {
      for (const tagId of allTagIds) {
        await tagSyncService.enqueueDetach({
          workspaceId,
          contactId: contact.id,
          tagId,
        })
      }
    }

    // Emit tag removed events per chunk.
    for (const contact of contacts) {
      for (const tag of allTags) {
        try {
          await emitTagRemoved(workspaceId, contact.id, tag.id)
        } catch (error) {
          logger.error({ err: error }, "Failed to emit tagRemoved event:")
        }
      }
    }
  }

  await invalidateCacheByTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])
}
