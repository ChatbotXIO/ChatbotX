"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationArchived } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
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
        emit("analytics:dashboard", {
          eventType: "conversation:archived",
          workspaceId,
          conversationId: conv.id,
          channel: "webchat", // TODO: replace correct channel from contact inbox
          occurredAt: new Date(),
          metadata: {
            triggerContext: {
              triggerSource: "api",
              triggerHandler: "archiveConversationAction",
              triggerType: "conversation_archived",
            },
          },
        }).catch((error) => {
          console.error("[archiveConversation] Failed to emit", error)
        })
      }

      revalidateCacheTags(`workspaces:${workspaceId}#conversations`)
    },
  )
