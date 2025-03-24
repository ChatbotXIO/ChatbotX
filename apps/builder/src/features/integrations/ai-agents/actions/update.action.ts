"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { AIAgentException } from "@/features/integrations/ai-agents/schemas/errors.schema"
import {
  type UpdateAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/integrations/ai-agents/schemas/update.schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const updateAIAgentAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateAIAgentRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateAIAgentRequest
    }) => {
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

      await prisma.aIAgent.update({
        where: {
          id: agentId,
        },
        data: parsedInput,
      })

      revalidateTag(`chatbots:${chatbotId}#aiAgents`)
    },
  )
