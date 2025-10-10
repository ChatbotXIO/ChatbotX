"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type CreateAIAgentRequest,
  createAIAgentRequest,
} from "@/features/ai-agents/schemas/create.schema"
import { AIAgentException } from "@/features/ai-agents/schemas/errors.schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const createAIAgentAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIAgentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateAIAgentRequest
    }) => {
      const existingAIAgent = await prisma.aIAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAIAgent) {
        throw new AIAgentException(
          `AIAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aIAgent.create({
        data: {
          chatbotId,
          ...parsedInput,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiAgents`)
    },
  )
