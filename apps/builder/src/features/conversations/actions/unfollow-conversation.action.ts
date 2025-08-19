"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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
          followed: false,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
    },
  )
