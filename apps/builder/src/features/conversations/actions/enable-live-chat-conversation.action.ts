import { db } from "@chatbotx.io/database/client"
import type { UserModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationTransferredToHuman } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { disableConversationState } from "../queries/bot-state"

export const enableLiveChatConversationAction = workspaceActionClient
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
      // Get conversations before updating to emit events
      const conversations = await db.query.conversationModel.findMany({
        where: {
          workspaceId,
          id: {
            in: parsedInput.ids,
          },
        },
      })

      await disableConversationState({
        workspaceId,
        conversationIds: parsedInput.ids,
      })

      // Emit conversation transferred to human events
      for (const conv of conversations) {
        try {
          await emitConversationTransferredToHuman(
            workspaceId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          logger.error(
            { err: error },
            "Failed to emit conversationTransferredToHuman event:",
          )
        }
      }

      for (const conv of conversations) {
        emit("analytics:dashboard", {
          eventType: "conversation:transferred_to_human",
          workspaceId,
          conversationId: conv.id,
          channel: "webchat", // TODO: replace correct channel from contact inbox
          occurredAt: new Date(),
          metadata: {
            triggerContext: {
              triggerSource: "api",
              triggerHandler: "enableLiveChatConversationAction",
              triggerType: "conversation_transferred_to_human",
            },
          },
        }).catch((error) => {
          logger.error(
            { err: error },
            "[enableLiveChatConversationAction] Failed to emit",
          )
        })
      }

      revalidateCacheTags([
        `workspaces:${workspaceId}#conversations`,
        ...parsedInput.ids.map(
          (id) => `workspaces:${workspaceId}#conversations:${id}`,
        ),
      ])
    },
  )
