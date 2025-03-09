"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

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
          messages: aiAgent.messages as JsonObject[],
          chatbotId: aiAgent.chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiAgents`)
    },
  )
