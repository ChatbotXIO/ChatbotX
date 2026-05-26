"use server"

import {
  auditLogActions,
  contactEventTypes,
  logAudit,
  recordContactEventBulk,
} from "@chatbotx.io/business"
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
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: RemoveContactTagsRequest
      ctx: { user: { id: string } }
    }) => {
      await removeContactTags({
        workspaceId,
        parsedInput,
      })

      if (parsedInput.ids.length > 0 && parsedInput.tags.length > 0) {
        // tags em remove-contact-tag são IDs, então busca nomes pra log
        const tagNames = await db.query.tagModel.findMany({
          columns: { name: true },
          where: { workspaceId, id: { in: parsedInput.tags } },
        })
        const names = tagNames.map((t) => t.name)
        await Promise.all([
          logAudit({
            workspaceId,
            userId: user.id,
            action: auditLogActions.CONTACT_TAG_REMOVED,
            detail: `Etiqueta(s) ${names.map((n) => `"${n}"`).join(", ")} removida(s) de ${parsedInput.ids.length} contato(s)`,
          }),
          recordContactEventBulk({
            contactIds: parsedInput.ids,
            workspaceId,
            eventType: contactEventTypes.TAG_REMOVED,
            meta: { tagNames: names },
            actorUserId: user.id,
          }),
        ])
      }
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

  // Emit tag removed events for all contacts and tags
  for (const contact of contacts) {
    for (const tag of allTags) {
      try {
        await emitTagRemoved(workspaceId, contact.id, tag.id)
      } catch (error) {
        console.error("Falha ao emitir evento tagRemoved:", error)
      }
    }
  }

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#tags`,
  ])
}
