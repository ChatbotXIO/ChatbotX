import type { IntegrationOpenAI } from "@prisma/client"
import { z } from "zod"

export type IntegrationOpenAIResource = IntegrationOpenAI

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(8192),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>
