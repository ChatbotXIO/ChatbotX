"use server"

import {
  type CreateContactEvent,
  contactTrackingService,
} from "@chatbotx.io/analytics"
import { and, db, inArray } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
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

      // Trigger delete events
      const events: CreateContactEvent[] = []
      for (const contact of contacts) {
        for (const contactInbox of contact.contactInboxes) {
          events.push({
            workspaceId,
            contactId: contact.id,
            eventType: "contact_deleted" as const,
            occurredAt,
            source: contactInbox.source,
            channel: contactInbox.channel,
            sourceId: contactInbox.sourceId,
          })
        }
      }

      contactTrackingService.trackEvents(events).catch((error) => {
        console.error(
          "[deleteContactAction] Failed to track contact_deleted events",
          error,
        )
      })

      revalidateCacheTags(`workspaces:${workspaceId}#contacts`)
    },
  )
