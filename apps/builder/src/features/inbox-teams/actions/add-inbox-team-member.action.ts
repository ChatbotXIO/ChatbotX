"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddInboxTeamMemberRequest,
  addInboxTeamMemberRequest,
} from "../schemas/add-inbox-team-member.request"

export const addInboxTeamMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(addInboxTeamMemberRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: AddInboxTeamMemberRequest
    }) => {
      await prisma.$transaction(async (tx) => {
        const existingMembers = await tx.inboxTeamMember.findMany({
          where: {
            userId: {
              in: parsedInput.userIds,
            },
            chatbotId,
            id,
          },
          select: {
            userId: true,
          },
        })

        const existingUserIds = new Set(
          existingMembers.map((member) => member.userId),
        )

        const newUserIds = parsedInput.userIds.filter(
          (userId) => !existingUserIds.has(userId),
        )

        await tx.inboxTeamMember.createMany({
          data: newUserIds.map((userId) => ({
            userId,
            chatbotId,
            inboxTeamId: id,
          })),
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
