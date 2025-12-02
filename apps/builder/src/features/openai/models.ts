export const openAIModels = {
  gpt51: "gpt-5.1",
  gpt5: "gpt-5",
  gpt5Mini: "gpt-5-mini",
  gpt5Nano: "gpt-5-nano",
  gpt5ChatLatest: "gpt-5-chat-latest",
  gpt4o: "gpt-4o",
  gpt4oMini: "gpt-4o-mini",
  gpt4oAudioPreview: "gpt-4o-audio-preview",
  gpt4Turbo: "gpt-4-turbo",
  gpt4: "gpt-4",
} as const

export const openAIModelOptions = [
  {
    label: "GPT-5.1",
    value: openAIModels.gpt51,
  },
  {
    label: "GPT-5",
    value: openAIModels.gpt5,
  },
  {
    label: "GPT-5 Mini",
    value: openAIModels.gpt5Mini,
  },
  {
    label: "GPT-5 Nano",
    value: openAIModels.gpt5Nano,
  },
  {
    label: "GPT-5 Chat Latest",
    value: openAIModels.gpt5ChatLatest,
  },
  {
    label: "GPT-4o",
    value: openAIModels.gpt4o,
  },
  {
    label: "GPT-4o Mini",
    value: openAIModels.gpt4oMini,
  },
  {
    label: "GPT-4o Audio Preview",
    value: openAIModels.gpt4oAudioPreview,
  },
  {
    label: "GPT-4 Turbo",
    value: openAIModels.gpt4Turbo,
  },
  {
    label: "GPT-4",
    value: openAIModels.gpt4,
  },
]
