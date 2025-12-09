import type { AIProvider } from "@aha.chat/flow-config"

export const AIMessageRoleForAI = {
  user: "user" as const,
  assistant: "assistant" as const,
  system: "system" as const,
} as const

export type AIMessageRoleForAI =
  (typeof AIMessageRoleForAI)[keyof typeof AIMessageRoleForAI]

export type AIMessage = {
  role: AIMessageRoleForAI
  content: string
}

export type AIGenerateTextStep = {
  id: string
  stepType: string
  model?: string
  prompt?: string
  userMessage?: string
  outputCfId?: string
  tools?: string[]
  rememberConversation?: boolean
  temperature?: number
  maxTokens?: number
  provider?: string
}

export type AIProviderConfig = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}
