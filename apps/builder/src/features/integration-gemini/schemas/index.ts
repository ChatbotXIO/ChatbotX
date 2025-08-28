import type { IntegrationGeminiModel } from "@aha.chat/database/types"
import { z } from "zod"

export type IntegrationGeminiResource = IntegrationGeminiModel

export const connectGeminiRequest = z.object({
  apiKey: z.string(),
})
export type ConnectGeminiRequest = z.infer<typeof connectGeminiRequest>

export const updateGeminiRequest = z.object({
  aiAutoReply: z.boolean().optional(),
})
export type UpdateGeminiRequest = z.infer<typeof updateGeminiRequest>
