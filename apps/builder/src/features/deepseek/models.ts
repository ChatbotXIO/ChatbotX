export const deepseekModels = {
  deepseekChat: "deepseek-chat",
  deepseekChatV2: "deepseek-chat-v2",
  deepseekCoder: "deepseek-coder",
  deepseekCoderV2: "deepseek-coder-v2",
} as const

export const deepseekModelOptions = [
  {
    label: "DeepSeek-V2.5",
    value: deepseekModels.deepseekChat,
  },
  {
    label: "DeepSeek-V2",
    value: deepseekModels.deepseekChatV2,
  },
  {
    label: "DeepSeek-Coder",
    value: deepseekModels.deepseekCoder,
  },
  {
    label: "DeepSeek-Coder-V2",
    value: deepseekModels.deepseekCoderV2,
  },
]
