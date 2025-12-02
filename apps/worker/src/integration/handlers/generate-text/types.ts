import type { AIProvider } from "@aha.chat/database/types"

export type AIMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

export type AIGenerateTextStep = {
  id: string
  stepType: string
  model?: string
  prompt?: string
  userMessage?: string
  resultCustomFieldId?: string
  tools?: string[]
  rememberConversation?: boolean
  temperature?: number
  maxTokens?: number
}

export type AIProviderConfig = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}

