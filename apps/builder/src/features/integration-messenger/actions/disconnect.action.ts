"use server"

import { prisma } from "@aha.chat/database"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { unsubscribeApp } from "../libs"

export const disconnectMessengerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationMessenger =
        await prisma.integrationMessenger.findFirstOrThrow({
          where: { chatbotId },
        })
      if (integrationMessenger) {
        const authValue = integrationMessenger.auth as MessengerAuthValue
        await unsubscribeApp(
          authValue.metadata.version,
          authValue.tokens.pageAccessToken as string,
        )
      }

      await prisma.$transaction(async (tx) => {
        await tx.integrationMessenger.delete({
          where: { id: integrationMessenger.id },
        })
      })

      revalidateTag(`chatbots:${chatbotId}#messenger`)
    },
  )
