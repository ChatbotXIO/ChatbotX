"use server"

import { and, db, inArray } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteContactAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      const contacts = await db.query.contactModel.findMany({
        where: {
          workspaceId,
          id: {
            in: parsedInput.ids,
          },
        },
        with: {
          contactInboxes: true,
        },
      })

      await db.delete(contactModel).where(
        and(
          inArray(
            contactModel.id,
            contacts.map((c) => c.id),
          ),
        ),
      )

      const occurredAt = new Date()

      for (const contact of contacts) {
        for (const contactInbox of contact.contactInboxes) {
          emit("contact:deleted", {
            workspaceId,
            contactId: contactInbox.id,
            occurredAt,
            source: contactInbox.source,
            channel: contactInbox.channel,
            sourceId: contactInbox.sourceId,
            metadata: {
              triggerContext: {
                triggerSource: "api",
                triggerHandler: "deleteContact",
                triggerType: "contact_deleted",
              },
            },
          }).catch((error) => {
            console.error(
              "[deleteContactAction] Failed to emit contact:deleted event",
              error,
            )
          })
        }
      }

      revalidateCacheTags(`workspaces:${workspaceId}#contacts`)
    },
  )
