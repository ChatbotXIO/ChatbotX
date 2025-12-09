export const claudeModels = {
  claude35Sonnet: "claude-3-5-sonnet-20241022",
  claude35Haiku: "claude-3-5-haiku-20241022",
  claude3Opus: "claude-3-opus-20240229",
  claude3Sonnet: "claude-3-sonnet-20240229",
  claude3Haiku: "claude-3-haiku-20240307",
} as const

export const claudeModelOptions = [
  {
    label: "Claude 3.5 Sonnet",
    value: claudeModels.claude35Sonnet,
  },
  {
    label: "Claude 3.5 Haiku",
    value: claudeModels.claude35Haiku,
  },
  {
    label: "Claude 3 Opus",
    value: claudeModels.claude3Opus,
  },
  {
    label: "Claude 3 Sonnet",
    value: claudeModels.claude3Sonnet,
  },
  {
    label: "Claude 3 Haiku",
    value: claudeModels.claude3Haiku,
  },
]
