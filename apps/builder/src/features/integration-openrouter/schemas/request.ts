import { openrouterModels } from "@chatbotx.io/ai"
import { z } from "zod"

export const connectOpenRouterSchema = z.object({
  apiKey: z.string().min(1),
  model: openrouterModels.default(openrouterModels.enum["openai/gpt-5.4-mini"]),
  temperature: z.number().min(0).max(2).default(0.7),
  maxOutputTokens: z.number().min(1).default(1024),
})
export type ConnectOpenRouterSchema = z.infer<typeof connectOpenRouterSchema>

export const updateOpenRouterRequest = z.object({
  autoReply: z.boolean().optional(),
})
export type UpdateOpenRouterRequest = z.infer<typeof updateOpenRouterRequest>
