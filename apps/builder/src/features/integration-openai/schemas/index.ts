import type { IntegrationOpenAIModel } from "@aha.chat/database/types"
import { z } from "zod"
import { openAIModels } from "@/features/openai/models"

export type IntegrationOpenAIResource = IntegrationOpenAIModel

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  model: z.enum(openAIModels).default(openAIModels.GPT4oMini),
  temperature: z.coerce.number().min(0).max(2),
  maxTokens: z.coerce.number().int().min(1).max(8192),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>
