"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import type { AITriggerModel, UserModel } from "@chatbotx.io/database/types"
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
