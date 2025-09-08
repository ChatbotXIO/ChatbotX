import type { Oauth2AuthValue, Oauth2Config } from "@aha.chat/sdk"

export type MessengerConfig = Oauth2Config & {
  version: string
  stateParams: {
    chatbotId: string
  }
}

export type MessengerAuthValue = Oauth2AuthValue & {
  version: string
  metadata: {
    scope: string
  }
}

// biome-ignore lint/complexity/noBannedTypes: wip
export type MessengerActions = {}
