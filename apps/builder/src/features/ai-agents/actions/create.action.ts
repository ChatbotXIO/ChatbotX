"use server"

import { db, eq } from "@aha.chat/database/client"
import { aiAgentModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type CreateAIAgentRequest,
  createAIAgentRequest,
} from "@/features/ai-agents/schemas/action"
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
      await db.transaction(async (tx) => {
        // Reset isDefault to false for all other agents
        if (parsedInput.isDefault) {
          await tx
            .update(aiAgentModel)
            .set({
              isDefault: false,
            })
            .where(eq(aiAgentModel.chatbotId, chatbotId))
        }

        await tx.insert(aiAgentModel).values({
          ...parsedInput,
          chatbotId,
          id: createId(),
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiAgents`)
    },
  )
