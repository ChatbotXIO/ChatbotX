import { deepseekModels } from "@chatbotx.io/ai"
import { z } from "zod"

export const connectDeepSeekSchema = z.object({
  apiKey: z.string().min(1),
  model: deepseekModels.default(deepseekModels.enum["deepseek-v4-flash"]),
  temperature: z.number().min(0).max(1).default(0.4),
  maxOutputTokens: z.number().min(1).default(1024),
})
export type ConnectDeepSeekSchema = z.infer<typeof connectDeepSeekSchema>

export const updateDeepSeekRequest = z.object({
  autoReply: z.boolean().optional(),
})
export type UpdateDeepSeekRequest = z.infer<typeof updateDeepSeekRequest>
