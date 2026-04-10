import type { Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"

export const DEFAULT_VERSION = "v4"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_CHATBOTX"

export type ZaloConfig = Oauth2Config

export type ZaloAuthValue = Oauth2AuthValue & {
  oaId: string
  metadata: {
    oaName: string
  }
}

export type ZaloResponseError = {
  error: number
  message: string
}
