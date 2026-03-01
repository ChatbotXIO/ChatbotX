export const aiProviders = {
  openai: "openai",
  gemini: "gemini",
  claude: "claude",
  deepseek: "deepseek",
} as const

export type AIProvider = keyof typeof aiProviders

export const defaultAIModelIds = {
  openai: "openai/gpt-4o-mini",
  gemini: "gemini/gemini-2.5-pro",
  claude: "claude/claude-3-5-sonnet-20241022",
  deepseek: "deepseek/deepseek-chat",
} as const

export const defaultImageModelIds = {
  openai: "dall-e-3",
  gemini: "gemini-3.1-flash-image-preview",
} as const
