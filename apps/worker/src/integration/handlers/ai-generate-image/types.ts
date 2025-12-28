import type {
  AIGenerateImageQualityType,
  AIProvider,
} from "@aha.chat/flow-config"

export type AIGenerateImageStep = {
  id: string
  stepType: string
  provider: AIProvider
  model: string
  prompt: string
  quality: AIGenerateImageQualityType
  size: string
  outputCfId: string
}

export type AIImageProviderConfig = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}
