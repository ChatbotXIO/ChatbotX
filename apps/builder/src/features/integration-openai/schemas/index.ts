import type { IntegrationOpenAIModel } from "@aha.chat/database/types"
import { OpenAIModel } from "@aha.chat/flow-config"
import { z } from "zod"

export type IntegrationOpenAIResource = IntegrationOpenAIModel

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  model: z.enum(OpenAIModel).default(OpenAIModel.GPT4oMini),
  temperature: z.coerce.number().min(0).max(2),
  maxTokens: z.coerce.number().int().min(1).max(8192),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>

export const OpenAIMessageRole = {
  Assistant: "assistant",
  Developer: "developer",
  User: "user",
} as const

export const openAIModelOptions: { value: string; label: string }[] = [
  {
    value: OpenAIModel.GPT4oMini,
    label: "gpt 4o mini",
  },
  {
    value: OpenAIModel.GPT35Turbo16K,
    label: "gpt 35 turbo 16K",
  },
  {
    value: OpenAIModel.GPT4o,
    label: "gpt 4o",
  },
  {
    value: OpenAIModel.GPT4,
    label: "gpt 4",
  },
  {
    value: OpenAIModel.GPT4Turbo,
    label: "gpt 4 turbo",
  },
  {
    value: OpenAIModel.GPT4TurboPreview,
    label: "gpt 4 turbo preview",
  },
  {
    value: OpenAIModel.ChatGPT4oLatest,
    label: "chat gpt 4o latest",
  },
  {
    value: OpenAIModel.O1Preview,
    label: "o1 preview",
  },
  {
    value: OpenAIModel.O1Mini,
    label: "o1 mini",
  },
]
