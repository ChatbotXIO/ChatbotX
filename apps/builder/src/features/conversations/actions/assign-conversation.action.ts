"use server"

import { db, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationAssigned } from "@chatbotx.io/events"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schema/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
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
        with: {
          contactInboxes: true,
        },
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
          logger.error(
            { err: error },
            "Failed to emit conversationAssigned event:",
          )
        }
      }

      const toAssignee =
        updatedData.assignedUserId || updatedData.assignedInboxTeamId
      if (toAssignee) {
        for (const conv of conversations) {
          for (const contactInbox of conv.contactInboxes) {
            emit("analytics:dashboard", {
              eventType: "conversation:assigned",
              workspaceId,
              conversationId: conv.id,
              toAssignee,
              occurredAt: new Date(),
              channel: contactInbox.channel,
              metadata: {
                triggerContext: {
                  triggerSource: "api",
                  triggerHandler: "assignConversation",
                  triggerType: "conversation_assigned",
                },
              },
            }).catch((error) => {
              logger.error(
                { err: error },
                "[assignConversation] Failed to emit",
              )
            })
          }
        }
      } else {
        for (const conv of conversations) {
          for (const contactInbox of conv.contactInboxes) {
            emit("analytics:dashboard", {
              eventType: "conversation:unassigned",
              workspaceId,
              conversationId: conv.id,
              occurredAt: new Date(),
              channel: contactInbox.channel,
              metadata: {
                triggerContext: {
                  triggerSource: "api",
                  triggerHandler: "assignConversation",
                  triggerType: "conversation_unassigned",
                },
              },
            }).catch((error) => {
              logger.error(
                { err: error },
                "[assignConversation] Failed to emit",
              )
            })
          }
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
