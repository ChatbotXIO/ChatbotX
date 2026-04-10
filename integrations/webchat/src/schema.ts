import type { CustomAuthValue } from "@chatbotx.io/sdk"

export type WebchatAuthValue = CustomAuthValue & {
  websocketUrl: string
  apiKey: string
}

export type WebchatActions = Record<string, never>
