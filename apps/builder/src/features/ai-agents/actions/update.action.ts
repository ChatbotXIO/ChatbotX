"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { aiAgentModel } from "@aha.chat/database/schema"
import type { AIAgentModel } from "@aha.chat/database/types"
import {
  type UpdateAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/action"
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
      const aiAgent = await findOrFail<AIAgentModel>(
        aiAgentModel,
        {
          id: agentId,
          chatbotId,
        },
        "AI agent not found",
      )
      await db.transaction(async (tx) => {
        // make all other agents not default
        if (parsedInput.isDefault) {
          await tx
            .update(aiAgentModel)
            .set({ isDefault: false })
            .where(eq(aiAgentModel.chatbotId, chatbotId))
        }

        await tx
          .update(aiAgentModel)
          .set(parsedInput)
          .where(eq(aiAgentModel.id, aiAgent.id))
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiAgents`)
    },
  )
