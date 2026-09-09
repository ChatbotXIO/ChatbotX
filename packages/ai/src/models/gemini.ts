import { z } from "zod"

export const geminiEmbeddingModels = z.enum(["gemini-embedding-001"])
export type GeminiEmbeddingModel = z.infer<typeof geminiEmbeddingModels>

export const geminiModels = z.enum([
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
])
export type GeminiModel = z.infer<typeof geminiModels>

export const geminiAnalyzeImageModelOptions: {
  label: string
  value: GeminiModel
}[] = [
  {
    label: "Gemini 3.5 Flash",
    value: geminiModels.enum["gemini-3.5-flash"],
  },
  {
    label: "Gemini 3.1 Flash Lite",
    value: geminiModels.enum["gemini-3.1-flash-lite"],
  },
  {
    label: "Gemini 3.1 Pro Preview",
    value: geminiModels.enum["gemini-3.1-pro-preview"],
  },
]

export const geminiModelOptions: { label: string; value: GeminiModel }[] = [
  {
    label: "Gemini 3.5 Flash",
    value: geminiModels.enum["gemini-3.5-flash"],
  },
  {
    label: "Gemini 3.1 Pro Preview",
    value: geminiModels.enum["gemini-3.1-pro-preview"],
  },
  {
    label: "Gemini 3.1 Flash Lite",
    value: geminiModels.enum["gemini-3.1-flash-lite"],
  },
]

export const geminiImageModels = z.enum(["gemini-3.1-flash-image"])
export type GeminiImageModel = z.infer<typeof geminiImageModels>

export const geminiImageModelOptions: {
  label: string
  value: GeminiImageModel
}[] = [
  {
    label: "Gemini 3.1 Flash Image",
    value: geminiImageModels.enum["gemini-3.1-flash-image"],
  },
]
