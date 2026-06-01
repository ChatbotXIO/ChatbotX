"use server"

import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schemas/contact-tag"

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
  const contacts = await db.query.contactModel.findMany({
    where: {
      workspaceId,
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

  const allTags = await db.transaction(async (tx) => {
    // Create new tags if they don't exist
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

    const allTags = await tx.query.tagModel.findMany({
      where: {
        workspaceId,
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

    return allTags
  })

  for (const contact of contacts) {
    for (const tag of allTags) {
      await emitTagApplied(workspaceId, contact.id, tag.id)
    }
  }

  revalidateCacheTags([
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
  await findOrFail({
    table: contactModel,
    where: { id: contactId, workspaceId },
  })
  await findOrFail({ table: tagModel, where: { id: tagId, workspaceId } })

  await db
    .insert(contactsToTagsModel)
    .values({
      contactId,
      tagId,
    })
    .onConflictDoNothing({
      target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
    })

  await emitTagApplied(workspaceId, contactId, tagId)
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
  await findOrFail({
    table: contactModel,
    where: {
      id: contactId,
      workspaceId,
    },
  })
  await findOrFail({
    table: tagModel,
    where: {
      id: tagId,
      workspaceId,
    },
  })

  await db
    .delete(contactsToTagsModel)
    .where(
      and(
        eq(contactsToTagsModel.contactId, contactId),
        eq(contactsToTagsModel.tagId, tagId),
      ),
    )

  await emitTagRemoved(workspaceId, contactId, tagId)
}
