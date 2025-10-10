"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const followConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await prisma.conversation.update({
        where: {
          id,
          chatbotId,
        },
        data: {
          followed: true,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
    },
  )
