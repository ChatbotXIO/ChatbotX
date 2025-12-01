// Gemini model definitions
export const GEMINI_MODELS = {
  // Gemini 2.5 models
  "gemini-2.5-pro": {
    label: "Gemini 2.5 Pro",
    maxTokens: 1_000_000,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash": {
    label: "Gemini 2.5 Flash",
    maxTokens: 1_000_000,
    contextWindow: 1_000_000,
  },
} as const

export type GeminiModel = keyof typeof GEMINI_MODELS

export const GEMINI_MODEL_OPTIONS = Object.entries(GEMINI_MODELS).map(
  ([value, model]) => ({
    value,
    label: model.label,
  }),
)

// Function to get models by category
export function getModelsByCategory() {
  return {
    language: ["gemini-2.5-pro", "gemini-2.5-flash"],
  }
}
