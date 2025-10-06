import type {
  ContactEntity,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
  Oauth2Config,
  SendMessageProps,
} from "@aha.chat/sdk"
import type { ZaloWebhookEvent } from "./webhook"

export const DEFAULT_VERSION = "v4"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_AHACHATAI"

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
  sendMessage: (props: SendMessageProps<ZaloAuthValue>) => Promise<void>
  getUserProfile: (props: {
    ctx: Context<ZaloAuthValue>
    uid: string
  }) => Promise<ContactEntity>
}
