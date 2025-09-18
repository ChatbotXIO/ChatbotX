"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectZaloAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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

      revalidateTag(`chatbots:${chatbotId}#zalo`)
    },
  )
