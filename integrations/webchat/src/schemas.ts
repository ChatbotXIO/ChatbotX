import type { CustomAuthValue } from "@aha.chat/sdk"

export type WebchatAuthValue = CustomAuthValue & {
  websocketUrl: string
  apiKey: string
}

export type WebchatActions = Record<string, never>
