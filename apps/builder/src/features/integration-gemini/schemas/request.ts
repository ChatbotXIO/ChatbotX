import { z } from "zod"
import { geminiModels } from "@/features/integration-gemini/schemas/models"

export const connectGeminiRequest = z.object({
  apiKey: z.string(),
  model: z.enum(geminiModels).default(geminiModels.gemini25Flash),
  temperature: z.number().min(0).max(1).default(0.4),
  maxOutputTokens: z.number().min(1).default(1024),
})
export type ConnectGeminiRequest = z.infer<typeof connectGeminiRequest>

export const updateGeminiRequest = z.object({
  autoReply: z.boolean().optional(),
})
export type UpdateGeminiRequest = z.infer<typeof updateGeminiRequest>
