"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { aiTriggerModel } from "@aha.chat/database/schema"
import type { AITriggerModel, UserModel } from "@aha.chat/database/types"
import {
  type UpdateAITriggerRequest,
  updateAITriggerRequest,
} from "@/features/ai-triggers/schemas/action"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const updateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateAITriggerRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateAITriggerRequest
    }) => {
      const aiTrigger = await findOrFail<AITriggerModel>(
        aiTriggerModel,
        {
          id,
          chatbotId,
        },
        "AITrigger not found",
      )

      await db
        .update(aiTriggerModel)
        .set(parsedInput)
        .where(eq(aiTriggerModel.id, aiTrigger.id))

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
