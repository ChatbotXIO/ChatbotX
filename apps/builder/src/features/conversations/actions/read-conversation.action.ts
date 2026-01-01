"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const readConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await prisma.conversation.findFirstOrThrow({
        where: { id, chatbotId },
        select: {
          id: true,
        },
      })

      await prisma.conversation.update({
        where: { id },
        data: { agentLastSeenAt: new Date() },
      })
    },
  )
