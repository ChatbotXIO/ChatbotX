"use server"

import { and, db, inArray } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import { contactTrackingService } from "@chatbotx.io/analytics"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      const contacts = await db.query.contactModel.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
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

      const events = contacts
        .filter((contact) => Boolean(contact.sourceId))
        .map((contact) => ({
          chatbotId,
          contactId: contact.sourceId as string,
          eventType: "contact_deleted" as const,
          occurredAt: contact.updatedAt,
          source: contact.source,
          channel: contact.channel,
          sourceId: contact.sourceId as string,
        }))

      contactTrackingService.trackEvents(events).catch((error) => {
        console.error(
          "[deleteContactAction] Failed to track contact_deleted events",
          error,
        )
      })

      revalidateCacheTags(`chatbots:${chatbotId}#contacts`)
    },
  )
