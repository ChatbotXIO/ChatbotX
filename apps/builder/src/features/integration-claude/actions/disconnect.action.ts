"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectClaudeAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationClaude = await prisma.integrationClaude.findFirstOrThrow(
        {
          where: { chatbotId },
        },
      )

      await prisma.$transaction(async (tx) => {
        await tx.integration.delete({
          where: { id: integrationClaude.integrationId },
        })
      })
      return
    },
  )
