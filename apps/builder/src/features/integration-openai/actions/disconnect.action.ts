"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationOpenAI = await prisma.integrationOpenAI.findFirstOrThrow(
        {
          where: { chatbotId },
        },
      )

      await prisma.$transaction(async (tx) => {
        await tx.integration.delete({
          where: { id: integrationOpenAI.integrationId },
        })
      })
      return
    },
  )
