import type {
  BaseConfig,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
} from "@ahachat.ai/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"

export type WhatsappConfig = BaseConfig & {
  appSecret: string
  webhookVerifyToken: string
}

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    phoneNumberId: string
  }
}

export type WhatsappActions = {
  verifyAccessToken: Handler<{ ctx: Context<WhatsappAuthValue> }, string>
  receiveMessage: Handler<
    { ctx: Context<WhatsappAuthValue>; data: OnMessageArgs },
    { message: MessageEntity; conversation: ConversationEntity }
  >
  // sendMessage: (props: SendMessageProps) => Promise<void>
}
