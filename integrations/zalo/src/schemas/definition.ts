import type {
  ContactEntity,
  Context,
  Handler,
  Oauth2AuthValue,
  Oauth2Config,
  ReceivedMessageResult,
  SendFlowStepProps,
  SendMessageProps,
} from "@aha.chat/sdk"
import type { ZaloWebhookEvent } from "./webhook"

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
  receiveMessage: Handler<
    {
      ctx: Context<ZaloAuthValue>
      data: ZaloWebhookEvent
    },
    ReceivedMessageResult | null
  >
  sendFlowStep: (props: SendFlowStepProps<ZaloAuthValue>) => Promise<void>
  sendMessage: (props: SendMessageProps<ZaloAuthValue>) => Promise<void>
  getUserProfile: (props: {
    ctx: Context<ZaloAuthValue>
    psid: string
  }) => Promise<ContactEntity>
}

export type ZaloResponseError = {
  error: number
  message: string
}
