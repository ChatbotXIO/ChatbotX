import { AIMessageRole } from "@aha.chat/database/types"
import { aiProviders } from "@aha.chat/flow-config"
import { z } from "zod"
import { geminiModels } from "@/features/integration-gemini/schemas/models"
import { openaiChatModels } from "@/features/openai/models"

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(5000),
  messages: z.array(
    z.object({
      role: z.enum(AIMessageRole),
      content: z.string().trim().min(1).max(255),
    }),
  ),
  models: z.array(
    z.discriminatedUnion("provider", [
      z.object({
        provider: z.literal(aiProviders.gemini),
        model: z.enum(geminiModels),
      }),
      z.object({
        provider: z.literal(aiProviders.openai),
        model: z.enum(openaiChatModels),
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
