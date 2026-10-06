"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { createAiKeyConnectAction } from "@/lib/integration-actions"
import { connectDeepSeekSchema } from "../schema/request"

export const connectDeepSeekAction = createAiKeyConnectAction({
  provider: aiProviders.enum.deepseek,
  schema: connectDeepSeekSchema,
})
