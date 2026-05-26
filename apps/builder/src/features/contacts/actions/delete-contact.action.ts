"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
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
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: { id: string } }
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

      if (contacts.length > 0) {
        const labels = contacts
          .map(
            (c) =>
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              c.phoneNumber ||
              c.email ||
              c.id,
          )
          .slice(0, 5)
        const more = contacts.length > 5 ? ` (+${contacts.length - 5})` : ""
        await logAudit({
          workspaceId,
          userId: user.id,
          action: auditLogActions.CONTACT_DELETED,
          detail: `Contato(s) excluído(s): ${labels.map((l) => `"${l}"`).join(", ")}${more}`,
        })
      }

      const occurredAt = new Date()

      for (const contact of contacts) {
        for (const contactInbox of contact.contactInboxes) {
          emit("analytics:dashboard", {
            eventType: "contact:deleted",
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
