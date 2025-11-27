import { AIMessageRole } from "@aha.chat/database/types"
import { z } from "zod"
import { geminiModels } from "@/features/integration-gemini/schemas/models"
import { openAIModels } from "@/features/openai/models"

export const messageSchema = z.object({
  role: z.enum(AIMessageRole).optional(),
  content: z.string().min(1).optional(),
})
export type MessageSchema = z.infer<typeof messageSchema>

const modelSchema = z.array(
  z.discriminatedUnion("provider", [
    z.object({
      provider: z.literal("gemini"),
      model: z.enum(geminiModels),
    }),
    z.object({
      provider: z.literal("openAI"),
      model: z.enum(openAIModels),
    }),
  ]),
)
export type ModelSchema = z.infer<typeof modelSchema>

export const updateAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().max(5000).nullable(),
  messages: z.array(messageSchema),
  models: modelSchema,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(32_768),
  tools: z.array(z.string()),
})
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
