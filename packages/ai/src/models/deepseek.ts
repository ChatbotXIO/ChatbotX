import { z } from "zod"

// DeepSeek keeps `deepseek-chat` and `deepseek-reasoner` as legacy aliases.
// Prefer the explicit V4 ids for new configs, but keep aliases for compatibility
// with existing integrations and agents.
export const deepseekModels = z.enum([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner",
])
export type DeepSeekModel = z.infer<typeof deepseekModels>

export const deepseekModelOptions: { label: string; value: DeepSeekModel }[] = [
  {
    label: "DeepSeek V4 Flash",
    value: deepseekModels.enum["deepseek-v4-flash"],
  },
  {
    label: "DeepSeek V4 Pro",
    value: deepseekModels.enum["deepseek-v4-pro"],
  },
  {
    label: "DeepSeek Chat (Legacy)",
    value: deepseekModels.enum["deepseek-chat"],
  },
  {
    label: "DeepSeek Reasoner (Legacy)",
    value: deepseekModels.enum["deepseek-reasoner"],
  },
]
