import { z } from "zod"

export const geminiEmbeddingModels = z.enum(["text-embedding-004"])
export type GeminiEmbeddingModel = z.infer<typeof geminiEmbeddingModels>

export const geminiModels = z.enum([
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-thinking-exp",
])
export type GeminiModel = z.infer<typeof geminiModels>

export const geminiModelOptions: { label: string; value: GeminiModel }[] = [
  {
    label: "Gemini 3 Pro",
    value: geminiModels.enum["gemini-3-pro-image-preview"],
  },
  {
    label: "Gemini 2.5 Flash Lite",
    value: geminiModels.enum["gemini-2.5-flash-lite"],
  },
  {
    label: "Gemini 2.5 Flash",
    value: geminiModels.enum["gemini-2.5-flash"],
  },
  {
    label: "Gemini 2.5 Pro",
    value: geminiModels.enum["gemini-2.5-pro"],
  },
  {
    label: "Gemini 2.0 Flash Thinking",
    value: geminiModels.enum["gemini-2.0-flash-thinking-exp"],
  },
]
