import type { IntegrationClaudeModel } from "@aha.chat/database/types"
import { z } from "zod"
import { claudeChatModels, claudeModels } from "@/features/claude/models"

export type IntegrationClaudeResource = IntegrationClaudeModel

export const connectClaudeSchema = z.object({
  apiKey: z.string(),
  model: z
    .enum(claudeChatModels as [string, ...string[]])
    .default(claudeModels.claude35Sonnet),
  temperature: z.coerce.number().min(0).max(1),
  maxOutputTokens: z.coerce.number().int().min(1).max(8192),
})
export type ConnectClaudeSchema = z.infer<typeof connectClaudeSchema>

export const updateClaudeRequest = z
  .object({
    autoReply: z.boolean(),
  })
  .partial()
export type UpdateClaudeRequest = z.infer<typeof updateClaudeRequest>
