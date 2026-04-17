"use server"

import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const unarchiveConversationAction = workspaceActionClient
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
      const conversations = await db.query.conversationModel.findMany({
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

      await db
        .update(conversationModel)
        .set({
          archivedAt: null,
        })
        .where(
          and(
            eq(conversationModel.workspaceId, workspaceId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      for (const conv of conversations) {
        for (const contactInbox of conv.contactInboxes) {
          await conversationTrackingService.trackEvent(
          {
            workspaceId,
            conversationId: conv.id,
            eventType: "conversation_unarchived",
            eventId: createId(),
            channel: contactInbox.channel,
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "api",
                triggerHandler: "unarchiveConversationAction",
                triggerType: "conversation_unarchived",
              },
            },
          },
          { skipSpooler: true },
        )
        }
      }

      revalidateCacheTags(`workspaces:${workspaceId}#conversations`)
    },
  )
