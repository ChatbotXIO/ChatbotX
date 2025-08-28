// OpenAI model definitions from @ai-sdk/openai
export const OPENAI_MODELS = {
  // GPT-5 models
  "gpt-5": {
    label: "GPT-5",
  },
  "gpt-5-mini": {
    label: "GPT-5 Mini",
  },
  "gpt-5-nano": {
    label: "GPT-5 Nano",
  },
  "gpt-5-chat-latest": {
    label: "GPT-5 Chat Latest",
  },

  // GPT-4 models
  "gpt-4o": {
    label: "GPT-4o",
  },
  "gpt-4o-mini": {
    label: "GPT-4o Mini",
  },
  "gpt-4o-audio-preview": {
    label: "GPT-4o Audio Preview",
  },
  "gpt-4-turbo": {
    label: "GPT-4 Turbo",
  },
  "gpt-4": {
    label: "GPT-4",
  },
} as const

export type OpenAIModel = keyof typeof OPENAI_MODELS

export const OPENAI_MODEL_OPTIONS = Object.entries(OPENAI_MODELS).map(
  ([value, model]) => ({
    value,
    label: model.label,
  }),
)
// Function to get models by category
export function getModelsByCategory() {
  return {
    language: [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-chat-latest",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4o-audio-preview",
      "gpt-4-turbo",
      "gpt-4",
    ],
  }
}
