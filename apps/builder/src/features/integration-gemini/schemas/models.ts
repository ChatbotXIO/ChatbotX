export const geminiModels = {
  gemini3Pro: "gemini-3-pro-image-preview",
  gemini25FlashLite: "gemini-2.5-flash-lite",
  gemini25Flash: "gemini-2.5-flash",
  gemini25Pro: "gemini-2.5-pro",
  gemini20FlashThinking: "gemini-2.0-flash-thinking-exp",
} as const
export type GeminiModel = keyof typeof geminiModels

export const geminiModelOptions = [
  {
    label: "Gemini 3 Pro",
    value: geminiModels.gemini3Pro,
  },
  { label: "Gemini 2.5 Flash Lite", value: geminiModels.gemini25FlashLite },
  { label: "Gemini 2.5 Flash", value: geminiModels.gemini25Flash },
  { label: "Gemini 2.5 Pro", value: geminiModels.gemini25Pro },
  {
    label: "Gemini 2.0 Flash Thinking",
    value: geminiModels.gemini20FlashThinking,
  },
]
