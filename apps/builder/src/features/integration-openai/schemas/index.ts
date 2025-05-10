import type { IntegrationOpenAI } from "@ahachat.ai/database/types"
import { z } from "zod"

export type IntegrationOpenAIResource = IntegrationOpenAI

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  temperature: z.coerce.number().min(0).max(2),
  maxTokens: z.coerce.number().int().min(1).max(8192),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>

export enum OpenAIModel {
  GPT4oMini = "gpt-4o-mini",
  GPT35Turbo16K = "gpt-35-turbo-16K",
  GPT4o = "gpt-4o",
  GPT4 = "gpt-4",
  GPT4Turbo = "gpt-4-turbo",
  GPT4TurboPreview = "gpt-4-turbo-preview",
  ChatGPT4oLatest = "chat-gpt-4o-latest",
  O1Preview = "o1-preview",
  O1Mini = "o1-mini",
}

export enum OpenAIMessageRole {
  Assistant = "assistant",
  Developer = "developer",
  User = "user",
}

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
