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
  uploadMedia: Handler<{ ctx: Context<WhatsappAuthValue>; file: File }, string>
  receiveMessage: Handler<
    { ctx: Context<WhatsappAuthValue>; data: OnMessageArgs },
    {
      message: MessageEntity
      conversation: ConversationEntity
      flow: { flowVersionID: string; buttonId: string } | null
    }
  >
  sendMessage: (props: SendMessageProps) => Promise<void>
  getTemplates: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { limit: number }
    },
    {
      id: string
      name: string
    }[]
  >
  createTemplate: Handler<
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    { ctx: Context<WhatsappAuthValue>; body: any },
    {
      id: string
      name: string
      status: string
    }
  >
  getFlows: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { limit: number }
    },
    {
      id: string
      name: string
      status: string
    }[]
  >
}
