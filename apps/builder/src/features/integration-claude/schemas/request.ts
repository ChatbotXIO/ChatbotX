import { claudeModels } from "@chatbotx.io/ai"
import { z } from "zod"

export const connectClaudeSchema = z.object({
  apiKey: z.string().min(1),
  model: claudeModels.default(claudeModels.enum["claude-3-5-sonnet-20241022"]),
  temperature: z.number().min(0).max(1).default(0.4),
  maxOutputTokens: z.number().min(1).default(1024),
})
export type ConnectClaudeSchema = z.infer<typeof connectClaudeSchema>

export const updateClaudeRequest = z.object({
  autoReply: z.boolean().optional(),
})
export type UpdateClaudeRequest = z.infer<typeof updateClaudeRequest>
