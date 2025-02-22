import type { BaseConfig, Oauth2AuthValue } from "@ahachat.ai/sdk"

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    phoneNumberId: string
  }
}

export type WhatsappConfig = BaseConfig & {
  appSecret: string
  webhookVerifyToken: string
}
