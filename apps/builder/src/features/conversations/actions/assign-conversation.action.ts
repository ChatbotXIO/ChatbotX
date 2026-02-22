"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
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
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AssignConversationSchema
    }) => {
      const updatedData: {
        assignedUserId: string | null
        assignedInboxTeamId: string | null
      } = {
        assignedUserId: null,
        assignedInboxTeamId: null,
      }

      await prisma.$transaction(async (tx) => {
        if (parsedInput.assignedId?.startsWith("u_")) {
          const userId = parsedInput.assignedId.substring(2)
          const chatbotMember = await tx.chatbotMember.findFirst({
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
          const inboxteamId = parsedInput.assignedId.substring(2)
          const inboxTeam = await tx.inboxTeam.findFirst({
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

        const conversations = await tx.conversation.findMany({
          where: {
            chatbotId,
            contactId: {
              in: parsedInput.contactIds,
            },
          },
          select: { id: true },
        })
        const conversationIds = conversations.map((c) => c.id)
        if (conversationIds.length === 0) {
          return
        }

        await tx.conversation.updateMany({
          where: {
            id: {
              in: conversations.map((c) => c.id),
            },
          },
          data: updatedData,
        })

        revalidateCacheTags([
          `chatbots:${chatbotId}#conversations`,
          `chatbots:${chatbotId}#contacts`,
        ])

        const updatedConversations = await tx.conversation.findMany({
          where: {
            id: {
              in: conversations.map((c) => c.id),
            },
          },
        })

        await integrationQueue.add(IntegrationJobAction.assignConversation, {
          type: IntegrationJobAction.assignConversation,
          data: {
            conversations: updatedConversations,
          },
        })
      })
    },
  )
