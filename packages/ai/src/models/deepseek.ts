import { z } from "zod"

export const deepseekModels = z.enum([
  "deepseek-flash",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
])
export type DeepSeekModel = z.infer<typeof deepseekModels>

export const deepseekModelOptions: { label: string; value: DeepSeekModel }[] = [
  {
    label: "DeepSeek Flash",
    value: deepseekModels.enum["deepseek-flash"],
  },
  {
    label: "DeepSeek V4 Pro",
    value: deepseekModels.enum["deepseek-v4-pro"],
  },
]
