import z from "zod"
import { openAILanguageModels } from "../../../../ai/src/providers/openai"

export const baseOpenAISchema = z.object({
  id: z.string().cuid2(),
  model: z.enum(
    openAILanguageModels.map((model) => model.value) as [string, ...string[]],
  ),
})
