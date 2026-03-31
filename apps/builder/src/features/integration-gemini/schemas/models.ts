import { z } from "zod"

export const geminiModels = z.enum([
  "gemini/gemini-3-pro-image-preview",
  "gemini/gemini-2.5-flash-lite",
  "gemini/gemini-2.5-flash",
  "gemini/gemini-2.5-pro",
  "gemini/gemini-2.0-flash-thinking-exp",
])
export type GeminiModel = keyof typeof geminiModels

export const geminiModelOptions = [
  {
    label: "Gemini 3 Pro",
    value: geminiModels.enum["gemini/gemini-3-pro-image-preview"],
  },
  {
    label: "Gemini 2.5 Flash Lite",
    value: geminiModels.enum["gemini/gemini-2.5-flash-lite"],
  },
  {
    label: "Gemini 2.5 Flash",
    value: geminiModels.enum["gemini/gemini-2.5-flash"],
  },
  {
    label: "Gemini 2.5 Pro",
    value: geminiModels.enum["gemini/gemini-2.5-pro"],
  },
  {
    label: "Gemini 2.0 Flash Thinking",
    value: geminiModels.enum["gemini/gemini-2.0-flash-thinking-exp"],
  },
]
