export const openAIModels = {
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

export const openAIChatModelOptions = [
  {
    label: "GPT-5.2 Pro",
    value: openAIModels.gpt52Pro,
  },
  {
    label: "GPT-5.2 Chat Latest",
    value: openAIModels.gpt52ChatLatest,
  },
  {
    label: "GPT-5.2",
    value: openAIModels.gpt52,
  },
  {
    label: "GPT-5.1 Codex Mini",
    value: openAIModels.gpt51CodexMini,
  },
  {
    label: "GPT-5.1 Codex",
    value: openAIModels.gpt51Codex,
  },
  {
    label: "GPT-5.1 Chat Latest",
    value: openAIModels.gpt51ChatLatest,
  },
  {
    label: "GPT-5.1",
    value: openAIModels.gpt51,
  },
  {
    label: "GPT-5 Pro",
    value: openAIModels.gpt5Pro,
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
    label: "GPT-5 Codex",
    value: openAIModels.gpt5Codex,
  },
  {
    label: "GPT-5 Chat Latest",
    value: openAIModels.gpt5ChatLatest,
  },
  {
    label: "GPT-4.1",
    value: openAIModels.gpt41,
  },
  {
    label: "GPT-4.1 Mini",
    value: openAIModels.gpt41Mini,
  },
  {
    label: "GPT-4.1 Nano",
    value: openAIModels.gpt41Nano,
  },
  {
    label: "GPT-4o",
    value: openAIModels.gpt4o,
  },
  {
    label: "GPT-4o Mini",
    value: openAIModels.gpt4oMini,
  },
]
export const openAIChatModels = openAIChatModelOptions.map(
  (model) => model.value,
)
export type OpenAIChatModel = (typeof openAIChatModels)[number]
