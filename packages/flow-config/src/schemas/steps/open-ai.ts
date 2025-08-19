import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const OpenAIModel = {
  GPT4oMini: "gpt-4o-mini",
  GPT35Turbo16K: "gpt-35-turbo-16K",
  GPT4o: "gpt-4o",
  GPT4: "gpt-4",
  GPT4Turbo: "gpt-4-turbo",
  GPT4TurboPreview: "gpt-4-turbo-preview",
  ChatGPT4oLatest: "chat-gpt-4o-latest",
  O1Preview: "o1-preview",
  O1Mini: "o1-mini",
} as const

export const openAISchema = z.object({
  id: z.string().cuid2(),
  model: z.nativeEnum(OpenAIModel),
})
export type OpenAISchema = z.infer<typeof openAISchema>

export const openAIDefaultFn = (): OpenAISchema => ({
  id: createId(),
  model: OpenAIModel.GPT4oMini,
})
