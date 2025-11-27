"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId] }) => {
    const integrationGemini = await prisma.integrationGemini.findFirstOrThrow({
      where: { chatbotId },
    })

    await prisma.$transaction(async (tx) => {
      await tx.integration.delete({
        where: { id: integrationGemini.integrationId },
      })
    })
    return
  })
