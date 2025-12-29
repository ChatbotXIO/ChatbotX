import type {
  ContactEntity,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
  Oauth2Config,
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
    {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction?: { flowVersionId: string; buttonId: string } | null
    } | null
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
