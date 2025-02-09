"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"

export const disconnectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdBindSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdBindSchema
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
