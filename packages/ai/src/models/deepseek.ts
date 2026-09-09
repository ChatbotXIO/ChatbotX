import { z } from "zod"

export const deepseekModels = z.enum(["deepseek-v4-flash", "deepseek-v4-pro"])
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
]
