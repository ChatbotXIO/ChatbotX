"use server"

import { db, inArray } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { emitConversationAssigned } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schemas/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const assignConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(assignConversationSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AssignConversationSchema
      ctx: { user: UserModel }
    }) => {
      const updatedData: {
        assignedUserId: string | null
        assignedInboxTeamId: string | null
      } = {
        assignedUserId: null,
        assignedInboxTeamId: null,
      }

      if (parsedInput.assignedId?.startsWith("u_")) {
        const userId = parsedInput.assignedId.slice(2)
        const chatbotMember = await db.query.chatbotMemberModel.findFirst({
          where: {
            chatbotId,
            userId,
          },
        })
        if (!chatbotMember) {
          returnValidationErrors(assignConversationSchema, {
            assignedId: {
              _errors: ["User is not valid"],
            },
          })
        }
        updatedData.assignedUserId = chatbotMember.userId
      } else if (parsedInput.assignedId?.startsWith("t_")) {
        const inboxteamId = parsedInput.assignedId.slice(2)
        const inboxTeam = await db.query.inboxTeamModel.findFirst({
          where: {
            chatbotId,
            id: inboxteamId,
          },
        })
        if (!inboxTeam) {
          returnValidationErrors(assignConversationSchema, {
            assignedId: {
              _errors: ["Inbox Team is not valid"],
            },
          })
        }
        updatedData.assignedInboxTeamId = inboxTeam.id
      }

      const conversations = await db.query.conversationModel.findMany({
        where: {
          chatbotId,
          contactId: {
            in: parsedInput.contactIds,
          },
        },
        columns: { id: true, contactId: true, channel: true },
      })
      const conversationIds = conversations.map((c) => c.id)
      if (conversationIds.length === 0) {
        return
      }

      const updatedConversations = await db
        .update(conversationModel)
        .set({
          assignedUserId: updatedData.assignedUserId,
          assignedInboxTeamId: updatedData.assignedInboxTeamId,
        })
        .where(inArray(conversationModel.id, conversationIds))
        .returning()

      // Emit conversation assigned events
      const assignedTo =
        updatedData.assignedUserId || updatedData.assignedInboxTeamId || ""
      const assignedBy = ctx.user.id

      for (const conversation of conversations) {
        try {
          await emitConversationAssigned(
            chatbotId,
            conversation.contactId,
            conversation.id,
            assignedTo,
            assignedBy,
          )
        } catch (error) {
          console.error("Failed to emit conversationAssigned event:", error)
        }
      }

      const toAssignee =
        updatedData.assignedUserId || updatedData.assignedInboxTeamId
      if (toAssignee) {
        for (const conv of conversations) {
          await conversationTrackingService.trackEvent(
            {
              chatbotId,
              conversationId: conv.id,
              eventType: "conversation_assigned",
              eventId: createId(),
              toAssignee,
              occurredAt: new Date(),
              channel: conv.channel,
              metadata: {
                triggerContext: {
                  triggerSource: "api",
                  triggerHandler: "assignConversation",
                  triggerType: "conversation_assigned",
                },
              },
            },
            { skipSpooler: true },
          )
        }
      } else {
        for (const conv of conversations) {
          await conversationTrackingService.trackEvent(
            {
              chatbotId,
              conversationId: conv.id,
              eventType: "conversation_unassigned",
              eventId: createId(),
              occurredAt: new Date(),
              channel: conv.channel,
              metadata: {
                triggerContext: {
                  triggerSource: "api",
                  triggerHandler: "assignConversation",
                  triggerType: "conversation_unassigned",
                },
              },
            },
            { skipSpooler: true },
          )
        }
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#contacts`,
      ])

      await integrationQueue.add(IntegrationJobAction.assignConversation, {
        type: IntegrationJobAction.assignConversation,
        data: {
          conversations: updatedConversations,
        },
      })
    },
  )
