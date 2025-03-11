import type {
  BaseConfig,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
} from "@ahachat.ai/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import type { SendMessageProps } from "./outgoing-message.js"

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
    {
      message: MessageEntity
      conversation: ConversationEntity
      flow: { flowVersionID: string; buttonId: string } | null
    }
  >
  sendMessage: (props: SendMessageProps) => Promise<void>
}
