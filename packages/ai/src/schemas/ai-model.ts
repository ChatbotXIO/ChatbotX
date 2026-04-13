import { aiProviders } from "@chatbotx.io/utils/ai"
import { z } from "zod"

export const aiModelConfigSchema = z.object({
  provider: aiProviders,
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
})

export type AIModelConfig = z.infer<typeof aiModelConfigSchema>
