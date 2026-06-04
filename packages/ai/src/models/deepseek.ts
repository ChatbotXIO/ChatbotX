import { z } from "zod"

// DeepSeek's public API currently exposes two chat models:
//   - deepseek-chat     → DeepSeek-V3 (general chat)
//   - deepseek-reasoner → DeepSeek-R1 (reasoning)
// The previous `*-v2` / `*-coder*` ids are no longer valid model ids and
// would 400 at request time, so they are intentionally not listed here.
export const deepseekModels = z.enum(["deepseek-chat", "deepseek-reasoner"])
export type DeepSeekModel = z.infer<typeof deepseekModels>

export const deepseekModelOptions: { label: string; value: DeepSeekModel }[] = [
  {
    label: "DeepSeek-V3 (Chat)",
    value: deepseekModels.enum["deepseek-chat"],
  },
  {
    label: "DeepSeek-R1 (Reasoner)",
    value: deepseekModels.enum["deepseek-reasoner"],
  },
]
