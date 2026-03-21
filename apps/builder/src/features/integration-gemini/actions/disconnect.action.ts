"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationGeminiModel } from "@chatbotx.io/database/schema"
import type { IntegrationGeminiModel } from "@chatbotx.io/database/types"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId] }) => {
    const integrationGemini = await findOrFail<IntegrationGeminiModel>(
      integrationGeminiModel,
      { chatbotId },
      "Integration Gemini not found",
    )
    await db
      .delete(integrationGeminiModel)
      .where(eq(integrationGeminiModel.id, integrationGemini.id))
  })
