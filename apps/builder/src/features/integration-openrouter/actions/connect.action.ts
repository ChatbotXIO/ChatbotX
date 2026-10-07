"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { createAiKeyConnectAction } from "@/lib/integration-actions"
import { connectOpenRouterSchema } from "../schema/request"

export const connectOpenRouterAction = createAiKeyConnectAction({
  provider: aiProviders.enum.openrouter,
  schema: connectOpenRouterSchema,
})
