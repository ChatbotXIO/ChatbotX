import type {
  Context,
  IncomingContact,
  Oauth2AuthValue,
  Oauth2Config,
  SendFlowStepProps,
} from "@aha.chat/sdk"

export const DEFAULT_VERSION = "v4"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_CHATBOTX"

export type ZaloConfig = Oauth2Config

export type ZaloAuthValue = Oauth2AuthValue & {
  oaId: string
  metadata: {
    oaName: string
  }
}

export type ZaloActions = {
  sendFlowStep: (props: SendFlowStepProps<ZaloAuthValue>) => Promise<void>
  getUserProfile: (props: {
    ctx: Context<ZaloAuthValue>
    psid: string
  }) => Promise<IncomingContact>
}

export type ZaloResponseError = {
  error: number
  message: string
}
