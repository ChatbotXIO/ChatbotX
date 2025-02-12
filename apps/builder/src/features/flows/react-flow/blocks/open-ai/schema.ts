import { OpenAIModel } from "@/features/integration-openai/schemas"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAISchema = z.object({
  id: z.string().cuid2(),
  model: z.nativeEnum(OpenAIModel),
})
export type OpenAISchema = z.infer<typeof openAISchema>

export const openAIDefaultValue = (): OpenAISchema => ({
  id: createId(),
  model: OpenAIModel.GPT4oMini,
})
