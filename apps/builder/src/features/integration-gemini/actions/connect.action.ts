"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { createAiKeyConnectAction } from "@/lib/integration-actions"
import { connectGeminiRequest } from "../schema/request"

export const connectGeminiAction = createAiKeyConnectAction({
  provider: aiProviders.enum.gemini,
  schema: connectGeminiRequest,
})
