import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const DeepseekModel = {
  DeepSeekV25: "deepseek-chat",
  DeepSeekV2: "deepseek-chat-v2",
  DeepSeekCoder: "deepseek-coder",
  DeepSeekCoderV2: "deepseek-coder-v2",
} as const

export const deepseekSchema = z.object({
  id: z.cuid2(),
  model: z.enum(DeepseekModel),
})

