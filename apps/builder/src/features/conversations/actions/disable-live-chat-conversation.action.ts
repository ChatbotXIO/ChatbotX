import { db } from "@chatbotx.io/database/client"
import type { UserModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationTransferredToBot } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { enableConversationState } from "../queries/bot-state"

export const disableLiveChatConversationAction = workspaceActionClient
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

      await enableConversationState({
        workspaceId,
        conversationIds: parsedInput.ids,
      })

      // Emit conversation transferred to bot events
      for (const conv of conversations) {
        try {
          await emitConversationTransferredToBot(
            workspaceId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          console.error(
            "Failed to emit conversationTransferredToBot event:",
            error,
          )
        }
      }

      for (const conv of conversations) {
        emit("analytics:dashboard", {
          eventType: "conversation:transferred_to_bot",
          workspaceId,
          conversationId: conv.id,
          channel: "webchat", // TODO: replace correct channel from contact inbox
          occurredAt: new Date(),
          metadata: {
            triggerContext: {
              triggerSource: "api",
              triggerHandler: "disableLiveChatConversationAction",
              triggerType: "conversation_transferred_to_bot",
            },
          },
        }).catch((error) => {
          console.error(
            "[disableLiveChatConversationAction] Failed to emit",
            error,
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
