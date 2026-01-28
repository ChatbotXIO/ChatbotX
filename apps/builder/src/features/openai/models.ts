export const openaiModels = {
  gpt52Pro: "openai/gpt-5.2-pro",
  gpt52ChatLatest: "openai/gpt-5.2-chat-latest",
  gpt52: "openai/gpt-5.2",
  gpt51CodexMini: "openai/gpt-5.1-codex-mini",
  gpt51Codex: "openai/gpt-5.1-codex",
  gpt51ChatLatest: "openai/gpt-5.1-chat-latest",
  gpt51: "openai/gpt-5.1",
  gpt5Pro: "openai/gpt-5-pro",
  gpt5: "openai/gpt-5",
  gpt5Mini: "openai/gpt-5-mini",
  gpt5Nano: "openai/gpt-5-nano",
  gpt5Codex: "openai/gpt-5-codex",
  gpt5ChatLatest: "openai/gpt-5-chat-latest",
  gpt41: "openai/gpt-4.1",
  gpt41Mini: "openai/gpt-4.1-mini",
  gpt41Nano: "openai/gpt-4.1-nano",
  gpt4o: "openai/gpt-4o",
  gpt4oMini: "openai/gpt-4o-mini",
  gpt4oAudioPreview: "openai/gpt-4o-audio-preview",
  gpt4Turbo: "openai/gpt-4-turbo",
  gpt4: "openai/gpt-4",
} as const

export const openaiChatModelOptions = [
  {
    label: "GPT-5.2 Pro",
    value: openaiModels.gpt52Pro,
  },
  {
    label: "GPT-5.2 Chat Latest",
    value: openaiModels.gpt52ChatLatest,
  },
  {
    label: "GPT-5.2",
    value: openaiModels.gpt52,
  },
  {
    label: "GPT-5.1 Codex Mini",
    value: openaiModels.gpt51CodexMini,
  },
  {
    label: "GPT-5.1 Codex",
    value: openaiModels.gpt51Codex,
  },
  {
    label: "GPT-5.1 Chat Latest",
    value: openaiModels.gpt51ChatLatest,
  },
  {
    label: "GPT-5.1",
    value: openaiModels.gpt51,
  },
  {
    label: "GPT-5 Pro",
    value: openaiModels.gpt5Pro,
  },
  {
    label: "GPT-5",
    value: openaiModels.gpt5,
  },
  {
    label: "GPT-5 Mini",
    value: openaiModels.gpt5Mini,
  },
  {
    label: "GPT-5 Nano",
    value: openaiModels.gpt5Nano,
  },
  {
    label: "GPT-5 Codex",
    value: openaiModels.gpt5Codex,
  },
  {
    label: "GPT-5 Chat Latest",
    value: openaiModels.gpt5ChatLatest,
  },
  {
    label: "GPT-4.1",
    value: openaiModels.gpt41,
  },
  {
    label: "GPT-4.1 Mini",
    value: openaiModels.gpt41Mini,
  },
  {
    label: "GPT-4.1 Nano",
    value: openaiModels.gpt41Nano,
  },
  {
    label: "GPT-4o",
    value: openaiModels.gpt4o,
  },
  {
    label: "GPT-4o Mini",
    value: openaiModels.gpt4oMini,
  },
]
export const openaiChatModels = openaiChatModelOptions.map(
  (model) => model.value,
)
export type OpenAIChatModel = (typeof openaiChatModels)[number]
