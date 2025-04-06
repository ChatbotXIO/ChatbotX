import type {
  BaseConfig,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
  SendMessageProps,
} from "@ahachat.ai/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import type { WhatsappPhoneNumber } from "./types"

export type WhatsappConfig = BaseConfig & {
  appSecret: string
  webhookVerifyToken: string
}

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    phoneNumber?: WhatsappPhoneNumber
  }
}

export type WhatsappActions = {
  verifyAccessToken: Handler<
    {
      ctx: Context<WhatsappAuthValue>
    },
    WhatsappPhoneNumber
  >
  receiveMessage: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      data: OnMessageArgs
    },
    {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction?: { flowVersionId: string; buttonId: string }
    }
  >
  sendMessage: (props: SendMessageProps<WhatsappAuthValue>) => Promise<void>
}
