import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { aiProviders } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { geminiModels } from "@/features/integration-gemini/schemas/models"
import { openaiChatModels } from "@/features/openai/models"

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(10_000),
  messages: z.array(
    z.object({
      role: aiMessageRoles,
      content: z.string().trim().min(1).max(255),
    }),
  ),
  models: z.array(
    z.discriminatedUnion("provider", [
      z.object({
        provider: z.literal(aiProviders.enum.gemini),
        model: geminiModels,
      }),
      z.object({
        provider: z.literal(aiProviders.enum.openai),
        model: openaiChatModels,
      }),
    ]),
  ),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().min(1).max(32_768),
  tools: z.array(z.string()),
  isDefault: z.boolean(),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>

export const updateAIAgentRequest = createAIAgentRequest.partial()
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
