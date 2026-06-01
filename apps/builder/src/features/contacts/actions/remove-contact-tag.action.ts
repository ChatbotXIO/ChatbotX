"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactsToTagsModel } from "@chatbotx.io/database/schema"
import { emitTagRemoved } from "@chatbotx.io/events"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type RemoveContactTagsRequest,
  removeContactTagsRequest,
} from "../schemas/contact-tag"

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
      await removeContactTags({
        workspaceId,
        parsedInput,
      })
    },
  )

export const removeContactTags = async ({
  workspaceId,
  parsedInput,
}: {
  workspaceId: string
  parsedInput: RemoveContactTagsRequest
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
    const allTags = await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        OR: [
          {
            id: {
              in: parsedInput.tags,
            },
          },
        ],
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

    return allTags
  })

  for (const contact of contacts) {
    for (const tag of allTags) {
      await emitTagRemoved(workspaceId, contact.id, tag.id)
    }
  }

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])
}
