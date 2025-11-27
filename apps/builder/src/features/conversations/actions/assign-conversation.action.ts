"use server"

import { prisma } from "@aha.chat/database"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schemas/assign-conversation.schema"
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

      // Verify again assigned
      if (parsedInput.assignedId.startsWith("u_")) {
        const userId = parsedInput.assignedId.substring(2)
        const chatbotMember = await prisma.chatbotMember.findFirst({
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
      } else if (parsedInput.assignedId.startsWith("t_")) {
        const inboxteamId = parsedInput.assignedId.substring(2)
        const inboxTeam = await prisma.inboxTeam.findFirst({
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

      await prisma.conversation.updateMany({
        where: {
          chatbotId,
          contactId: {
            in: parsedInput.contactIds,
          },
        },
        data: updatedData,
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#contacts`,
      ])
    },
  )
