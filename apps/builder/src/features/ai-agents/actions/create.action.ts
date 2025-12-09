"use server"

import { prisma } from "@aha.chat/database"
import {
  type CreateAIAgentRequest,
  createAIAgentRequest,
} from "@/features/ai-agents/schemas/request"
import { AIAgentException } from "@/features/ai-agents/schemas/resource"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
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

      await prisma.$transaction(async (tx) => {
        // Reset isDefault to false for all other agents
        if (parsedInput.isDefault) {
          await tx.aIAgent.updateMany({
            where: {
              chatbotId,
            },
            data: {
              isDefault: false,
            },
          })
        }

        await tx.aIAgent.create({
          data: {
            chatbotId,
            ...parsedInput,
          },
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiAgents`)
    },
  )
