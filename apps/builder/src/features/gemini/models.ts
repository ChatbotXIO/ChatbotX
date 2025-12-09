export const geminiModels = {
  gemini25Pro: "gemini-2.5-pro",
  gemini25Flash: "gemini-2.5-flash",
} as const

export const geminiModelOptions = [
  {
    label: "Gemini 2.5 Pro",
    value: geminiModels.gemini25Pro,
  },
  {
    label: "Gemini 2.5 Flash",
    value: geminiModels.gemini25Flash,
  },
]
