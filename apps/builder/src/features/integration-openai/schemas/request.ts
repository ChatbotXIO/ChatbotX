import type { IntegrationOpenAIModel } from "@aha.chat/database/types"
import { z } from "zod"
import { openaiModels } from "@/features/openai/models"

export type IntegrationOpenAIResource = IntegrationOpenAIModel

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  model: z.enum(openaiModels).default(openaiModels.gpt4oMini),
  temperature: z.coerce.number().min(0).max(2),
  maxOutputTokens: z.coerce.number().int().min(1).max(8192),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>

export const updateOpenAIRequest = z
  .object({
    autoReply: z.boolean(),
  })
  .partial()
export type UpdateOpenAIRequest = z.infer<typeof updateOpenAIRequest>
