"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { createAiKeyConnectAction } from "@/lib/integration-actions"
import { connectOpenAISchema } from "../schema/request"

export const connectOpenAIAction = createAiKeyConnectAction({
  provider: aiProviders.enum.openai,
  schema: connectOpenAISchema,
})
