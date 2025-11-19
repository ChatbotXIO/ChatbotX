"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId] }) => {
    const integrationGemini = await prisma.integrationGemini.findFirstOrThrow({
      where: { chatbotId },
    })

    await prisma.integrationGemini.update({
      where: { id: integrationGemini.id },
      data: {
        auth: null as unknown as Prisma.NullableJsonNullValueInput,
        autoReply: false,
      },
    })
  })
