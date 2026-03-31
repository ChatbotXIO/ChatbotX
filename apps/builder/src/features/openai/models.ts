import { z } from "zod"

export const openaiModels = z.enum([
  "openai/gpt-5.2-pro",
  "openai/gpt-5.2-chat-latest",
  "openai/gpt-5.2",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-chat-latest",
  "openai/gpt-5.1",
  "openai/gpt-5-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5-codex",
  "openai/gpt-5-chat-latest",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4o-audio-preview",
  "openai/gpt-4-turbo",
  "openai/gpt-4",
])

export const openaiChatModelOptions = [
  {
    label: "GPT-5.2 Pro",
    value: openaiModels.enum["openai/gpt-5.2-pro"],
  },
  {
    label: "GPT-5.2 Chat Latest",
    value: openaiModels.enum["openai/gpt-5.2-chat-latest"],
  },
  {
    label: "GPT-5.2",
    value: openaiModels.enum["openai/gpt-5.2"],
  },
  {
    label: "GPT-5.1 Codex Mini",
    value: openaiModels.enum["openai/gpt-5.1-codex-mini"],
  },
  {
    label: "GPT-5.1 Codex",
    value: openaiModels.enum["openai/gpt-5.1-codex"],
  },
  {
    label: "GPT-5.1 Chat Latest",
    value: openaiModels.enum["openai/gpt-5.1-chat-latest"],
  },
  {
    label: "GPT-5.1",
    value: openaiModels.enum["openai/gpt-5.1"],
  },
  {
    label: "GPT-5 Pro",
    value: openaiModels.enum["openai/gpt-5-pro"],
  },
  {
    label: "GPT-5",
    value: openaiModels.enum["openai/gpt-5"],
  },
  {
    label: "GPT-5 Mini",
    value: openaiModels.enum["openai/gpt-5-mini"],
  },
  {
    label: "GPT-5 Nano",
    value: openaiModels.enum["openai/gpt-5-nano"],
  },
  {
    label: "GPT-5 Codex",
    value: openaiModels.enum["openai/gpt-5-codex"],
  },
  {
    label: "GPT-5 Chat Latest",
    value: openaiModels.enum["openai/gpt-5-chat-latest"],
  },
  {
    label: "GPT-4.1",
    value: openaiModels.enum["openai/gpt-4.1"],
  },
  {
    label: "GPT-4.1 Mini",
    value: openaiModels.enum["openai/gpt-4.1-mini"],
  },
  {
    label: "GPT-4.1 Nano",
    value: openaiModels.enum["openai/gpt-4.1-nano"],
  },
  {
    label: "GPT-4o",
    value: openaiModels.enum["openai/gpt-4o"],
  },
  {
    label: "GPT-4o Mini",
    value: openaiModels.enum["openai/gpt-4o-mini"],
  },
]
export const openaiChatModels = openaiChatModelOptions.map(
  (model) => model.value,
)
export type OpenAIChatModel = (typeof openaiChatModels)[number]
