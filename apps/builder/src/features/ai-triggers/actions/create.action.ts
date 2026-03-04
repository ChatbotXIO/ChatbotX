"use server"

import { db } from "@aha.chat/database/client"
import { aiTriggerModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type CreateAITriggerRequest,
  createAITriggerRequest,
} from "@/features/ai-triggers/schemas/action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const createAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAITriggerRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateAITriggerRequest
    }) => {
      await db.insert(aiTriggerModel).values({
        ...parsedInput,
        chatbotId,
        id: createId(),
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
