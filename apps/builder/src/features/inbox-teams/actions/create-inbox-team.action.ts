"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateInboxTeamRequest,
  createInboxTeamRequest,
} from "../schemas/create-inbox-team.request"

export const createInboxTeamAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createInboxTeamRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: CreateInboxTeamRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await prisma.inboxTeam.create({
        data: {
          name: parsedInput.name,
          chatbotId,
          inboxTeamMembers: {
            createMany: {
              data: parsedInput.userIds.map((userId) => ({
                userId,
                chatbotId,
              })),
            },
          },
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
