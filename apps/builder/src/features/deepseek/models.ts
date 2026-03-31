import { z } from "zod"

export const deepseekModels = z.enum([
  "deepseek-chat",
  "deepseek-chat-v2",
  "deepseek-coder",
  "deepseek-coder-v2",
])

export const deepseekModelOptions = [
  {
    label: "DeepSeek-V2.5",
    value: deepseekModels.enum["deepseek-chat"],
  },
  {
    label: "DeepSeek-V2",
    value: deepseekModels.enum["deepseek-chat-v2"],
  },
  {
    label: "DeepSeek-Coder",
    value: deepseekModels.enum["deepseek-coder"],
  },
  {
    label: "DeepSeek-Coder-V2",
    value: deepseekModels.enum["deepseek-coder-v2"],
  },
]
