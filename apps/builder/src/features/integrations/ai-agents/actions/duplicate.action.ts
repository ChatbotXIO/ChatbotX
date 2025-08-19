"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const duplicateAIAgentAction = authActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const aiAgent = await prisma.aIAgent.findFirst({
        where: {
          id,
          chatbotId,
        },
      })
      if (!aiAgent) {
        return {
          successful: true,
        }
      }

      await prisma.aIAgent.create({
        data: {
          name: `${aiAgent.name} _copy`,
          prompt: aiAgent.prompt,
          messages: aiAgent.messages as Prisma.InputJsonValue[],
          chatbotId: aiAgent.chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiAgents`)
    },
  )
