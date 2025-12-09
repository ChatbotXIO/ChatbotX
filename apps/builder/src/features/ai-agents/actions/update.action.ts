"use server"

import { prisma } from "@aha.chat/database"
import {
  type UpdateAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/request"
import { AIAgentException } from "@/features/ai-agents/schemas/resource"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const updateAIAgentAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateAIAgentRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateAIAgentRequest
    }) => {
      // Verify if the name is already taken
      if (parsedInput.name) {
        const existingAIAgent = await prisma.aIAgent.findFirst({
          select: {
            id: true,
          },
          where: {
            name: parsedInput.name,
            chatbotId,
            id: {
              not: agentId,
            },
          },
        })

        if (existingAIAgent) {
          throw new AIAgentException(
            `AIAgent with the name "${parsedInput.name}" already exists.`,
          )
        }
      }

      await prisma.$transaction(async (tx) => {
        // make all other agents not default
        if (parsedInput.isDefault) {
          await tx.aIAgent.updateMany({
            where: {
              chatbotId,
            },
            data: { isDefault: false },
          })
        }

        await tx.aIAgent.update({
          where: {
            id: agentId,
          },
          data: parsedInput,
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiAgents`)
    },
  )
