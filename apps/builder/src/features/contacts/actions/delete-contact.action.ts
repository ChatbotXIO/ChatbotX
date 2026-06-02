"use server"

import { contactService } from "@chatbotx.io/business"
import { emit } from "@chatbotx.io/event-bus"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteContact = async (ctx: {
  workspaceId: string
  ids: string[]
}) => {
  const contacts = await contactService.delete(ctx)

  const occurredAt = new Date()
  for (const contact of contacts) {
    for (const contactInbox of contact.contactInboxes) {
      emit("analytics:dashboard", {
        eventType: "contact:deleted",
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
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
      })
    }
  }
}

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
      await deleteContact({ workspaceId, ids: parsedInput.ids })
    },
  )
