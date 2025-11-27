export const openAIModels = {
  GPT51: "gpt-5.1",
  GPT5: "gpt-5",
  GPT5Mini: "gpt-5-mini",
  GPT5Nano: "gpt-5-nano",
  GPT5ChatLatest: "gpt-5-chat-latest",
  GPT4o: "gpt-4o",
  GPT4oMini: "gpt-4o-mini",
  GPT4oAudioPreview: "gpt-4o-audio-preview",
  GPT4Turbo: "gpt-4-turbo",
  GPT4: "gpt-4",
} as const

export const openAIModelOptions = [
  {
    label: "GPT-5.1",
    value: openAIModels.GPT51,
  },
  {
    label: "GPT-5",
    value: openAIModels.GPT5,
  },
  {
    label: "GPT-5 Mini",
    value: openAIModels.GPT5Mini,
  },
  {
    label: "GPT-5 Nano",
    value: openAIModels.GPT5Nano,
  },
  {
    label: "GPT-5 Chat Latest",
    value: openAIModels.GPT5ChatLatest,
  },
  {
    label: "GPT-4o",
    value: openAIModels.GPT4o,
  },
  {
    label: "GPT-4o Mini",
    value: openAIModels.GPT4oMini,
  },
  {
    label: "GPT-4o Audio Preview",
    value: openAIModels.GPT4oAudioPreview,
  },
  {
    label: "GPT-4 Turbo",
    value: openAIModels.GPT4Turbo,
  },
  {
    label: "GPT-4",
    value: openAIModels.GPT4,
  },
]
