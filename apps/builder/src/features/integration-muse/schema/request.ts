import { museModels } from "@chatbotx.io/ai"
import { z } from "zod"

export const connectMuseSchema = z.object({
  apiKey: z.string().min(1),
  model: museModels.default(museModels.enum["muse-spark-1.3"]),
  temperature: z.number().min(0).max(1).default(0.4),
  // Muse counts reasoning tokens against the output budget.
  maxOutputTokens: z.number().min(1).default(4096),
})
export type ConnectMuseSchema = z.infer<typeof connectMuseSchema>

export const updateMuseRequest = z.object({
  autoReply: z.boolean().optional(),
})
export type UpdateMuseRequest = z.infer<typeof updateMuseRequest>
