export const openAIModels = {
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

export const openAIModelOptions = Object.values(openAIModels).map((value) => ({
  value,
  label: value,
}))
