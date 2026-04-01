"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationGeminiModel } from "@chatbotx.io/database/schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateGeminiRequest,
  updateGeminiRequest,
} from "../schemas/request"

export const updateGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateGeminiRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationGemini = await findOrFail(
        integrationGeminiModel,
        { chatbotId },
        "Integration Gemini not found",
      )

      await db
        .update(integrationGeminiModel)
        .set(parsedInput)
        .where(eq(integrationGeminiModel.id, integrationGemini.id))
    },
  )
