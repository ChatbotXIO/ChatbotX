"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { createAiKeyConnectAction } from "@/lib/integration-actions"
import { connectClaudeSchema } from "../schema/request"

export const connectClaudeAction = createAiKeyConnectAction({
  provider: aiProviders.enum.claude,
  schema: connectClaudeSchema,
})
