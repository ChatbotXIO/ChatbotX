"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectZaloAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationZalo = await prisma.integrationZalo.findFirstOrThrow({
        where: { chatbotId },
      })

      await prisma.$transaction(async (tx) => {
        await tx.integrationZalo.delete({
          where: { id: integrationZalo.id },
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#zalo`)
    },
  )
