"use server"

import { emitConversationArchived } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const archiveConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: UserModel }
    }) => {
      // Get conversations before archiving to emit events
      const conversations = await db.query.conversationModel.findMany({
        where: {
          workspaceId,
          id: {
            in: parsedInput.ids,
          },
        },
        columns: {
          id: true,
          contactId: true,
          channel: true,
        },
      })

      await db
        .update(conversationModel)
        .set({
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(conversationModel.workspaceId, workspaceId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      // Emit conversation archived events
      for (const conv of conversations) {
        try {
          await emitConversationArchived(
            workspaceId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          console.error("Failed to emit conversationArchived event:", error)
        }
      }

      for (const conv of conversations) {
        await conversationTrackingService.trackEvent(
          {
            workspaceId,
            conversationId: conv.id,
            eventType: "conversation_archived",
            eventId: createId(),
            channel: "webchat", // TODO: replace correct channel from contact inbox
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "api",
                triggerHandler: "archiveConversationAction",
                triggerType: "conversation_archived",
              },
            },
          },
          { skipSpooler: true },
        )
      }

      revalidateCacheTags(`workspaces:${workspaceId}#conversations`)
    },
  )
