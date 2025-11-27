export const geminiModels = {
  gemini25Flash: "gemini-2.5-flash",
  gemini25Pro: "gemini-2.5-pro",
} as const
export type GeminiModel = keyof typeof geminiModels

export const geminiModelOptions = Object.values(geminiModels).map((value) => ({
  value,
  label: value,
}))
