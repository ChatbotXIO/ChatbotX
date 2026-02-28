import type { IntegrationDeepSeekModel } from "@aha.chat/database/types"
import { z } from "zod"

export type IntegrationDeepSeekResource = IntegrationDeepSeekModel

export const connectDeepSeekSchema = z.object({
  apiKey: z.string(),
  temperature: z.coerce.number().min(0).max(2).default(1),
  maxOutputTokens: z.coerce.number().int().min(1).max(8192).default(200),
})
export type ConnectDeepSeekSchema = z.infer<typeof connectDeepSeekSchema>

export const updateDeepSeekRequest = z
  .object({
    autoReply: z.boolean(),
  })
  .partial()
export type UpdateDeepSeekRequest = z.infer<typeof updateDeepSeekRequest>
