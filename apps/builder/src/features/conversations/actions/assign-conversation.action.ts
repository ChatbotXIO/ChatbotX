"use server"

import { emitConversationAssigned } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { db, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schema/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const assignConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(assignConversationSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
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
        const workspaceMember = await db.query.workspaceMemberModel.findFirst({
          where: {
            workspaceId,
            userId,
          },
        })
        if (!workspaceMember) {
          returnValidationErrors(assignConversationSchema, {
            assignedId: {
              _errors: ["User is not valid"],
            },
          })
        }
        updatedData.assignedUserId = workspaceMember.userId
      } else if (parsedInput.assignedId?.startsWith("t_")) {
        const inboxteamId = parsedInput.assignedId.slice(2)
        const inboxTeam = await db.query.inboxTeamModel.findFirst({
          where: {
            workspaceId,
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
          workspaceId,
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
            workspaceId,
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
              workspaceId,
              conversationId: conv.id,
              eventType: "conversation_assigned",
              eventId: createId(),
              toAssignee,
              occurredAt: new Date(),
              channel: "webchat", // TODO: replace correct channel from contact inbox
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
              workspaceId,
              conversationId: conv.id,
              eventType: "conversation_unassigned",
              eventId: createId(),
              occurredAt: new Date(),
              channel: "webchat", // TODO: replace correct channel from contact inbox
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
        `workspaces:${workspaceId}#conversations`,
        `workspaces:${workspaceId}#contacts`,
      ])

      await integrationQueue.add(IntegrationJobAction.assignConversation, {
        type: IntegrationJobAction.assignConversation,
        data: {
          conversations: updatedConversations,
        },
      })
    },
  )
