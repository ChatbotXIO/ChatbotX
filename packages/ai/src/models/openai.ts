import { z } from "zod"

export const openaiEmbeddingModels = z.enum(["text-embedding-ada-002"])
export type OpenAIEmbeddingModel = z.infer<typeof openaiEmbeddingModels>

export const openaiModels = z.enum([
  "gpt-4-turbo",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.1",
  "gpt-4",
  "gpt-4o-audio-preview",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5-chat-latest",
  "gpt-5-codex",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-pro",
  "gpt-5.1-chat-latest",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex",
  "gpt-5.1",
  "gpt-5.2-chat-latest",
  "gpt-5.2-pro",
  "gpt-5.2",
  "gpt-5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "o4-mini",
])
export type OpenAIModel = z.infer<typeof openaiModels>

export const openaiAnalyzeImageModelOptions: {
  label: string
  value: OpenAIModel
}[] = [
  {
    label: "GPT-5.4",
    value: openaiModels.enum["gpt-5.4"],
  },
  {
    label: "GPT-5.4 mini",
    value: openaiModels.enum["gpt-5.4-mini"],
  },
  {
    label: "GPT-5.4 nano",
    value: openaiModels.enum["gpt-5.4-nano"],
  },
  {
    label: "GPT-5.2",
    value: openaiModels.enum["gpt-5.2"],
  },
  {
    label: "GPT-5.1",
    value: openaiModels.enum["gpt-5.1"],
  },
  {
    label: "GPT-5 mini",
    value: openaiModels.enum["gpt-5-mini"],
  },
  {
    label: "GPT-4.1 mini",
    value: openaiModels.enum["gpt-4.1-mini"],
  },
  {
    label: "GPT-4.1",
    value: openaiModels.enum["gpt-4.1"],
  },
  {
    label: "GPT-4o mini",
    value: openaiModels.enum["gpt-4o-mini"],
  },
  {
    label: "GPT-4o",
    value: openaiModels.enum["gpt-4o"],
  },
  {
    label: "o4-mini",
    value: openaiModels.enum["o4-mini"],
  },
]

export const openaiModelOptions: { label: string; value: OpenAIModel }[] = [
  {
    label: "GPT-5.2 Pro",
    value: openaiModels.enum["gpt-5.2-pro"],
  },
  {
    label: "GPT-5.2 Chat Latest",
    value: openaiModels.enum["gpt-5.2-chat-latest"],
  },
  {
    label: "GPT-5.2",
    value: openaiModels.enum["gpt-5.2"],
  },
  {
    label: "GPT-5.1 Codex Mini",
    value: openaiModels.enum["gpt-5.1-codex-mini"],
  },
  {
    label: "GPT-5.1 Codex",
    value: openaiModels.enum["gpt-5.1-codex"],
  },
  {
    label: "GPT-5.1 Chat Latest",
    value: openaiModels.enum["gpt-5.1-chat-latest"],
  },
  {
    label: "GPT-5.1",
    value: openaiModels.enum["gpt-5.1"],
  },
  {
    label: "GPT-5 Pro",
    value: openaiModels.enum["gpt-5-pro"],
  },
  {
    label: "GPT-5",
    value: openaiModels.enum["gpt-5"],
  },
  {
    label: "GPT-5 Mini",
    value: openaiModels.enum["gpt-5-mini"],
  },
  {
    label: "GPT-5 Nano",
    value: openaiModels.enum["gpt-5-nano"],
  },
  {
    label: "GPT-5 Codex",
    value: openaiModels.enum["gpt-5-codex"],
  },
  {
    label: "GPT-5 Chat Latest",
    value: openaiModels.enum["gpt-5-chat-latest"],
  },
  {
    label: "GPT-4.1",
    value: openaiModels.enum["gpt-4.1"],
  },
  {
    label: "GPT-4.1 Mini",
    value: openaiModels.enum["gpt-4.1-mini"],
  },
  {
    label: "GPT-4.1 Nano",
    value: openaiModels.enum["gpt-4.1-nano"],
  },
  {
    label: "GPT-4o",
    value: openaiModels.enum["gpt-4o"],
  },
  {
    label: "GPT-4o Mini",
    value: openaiModels.enum["gpt-4o-mini"],
  },
  {
    label: "GPT-4o Audio Preview",
    value: openaiModels.enum["gpt-4o-audio-preview"],
  },
  {
    label: "GPT-4",
    value: openaiModels.enum["gpt-4"],
  },
  {
    label: "GPT-4 Turbo",
    value: openaiModels.enum["gpt-4-turbo"],
  },
]

export const openaiImageModels = z.enum(["gpt-image-1", "dall-e-3", "dall-e-2"])
export type OpenAIImageModel = z.infer<typeof openaiImageModels>

export const openaiImageModelOptions: {
  label: string
  value: OpenAIImageModel
}[] = [
  {
    label: "GPT Image 1",
    value: openaiImageModels.enum["gpt-image-1"],
  },
  {
    label: "DALL-E 3",
    value: openaiImageModels.enum["dall-e-3"],
  },
  {
    label: "DALL-E 2",
    value: openaiImageModels.enum["dall-e-2"],
  },
]
