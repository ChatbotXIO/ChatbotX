import type {
  BaseConfig,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
  SendFlowStepProps,
  SendMessageProps,
} from "@aha.chat/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import type {
  CreateMessageTemplateProps,
  ListMessageTemplatesReponse,
  MessageTemplateEntity,
} from "./message-templates"
import type { ListFlowsResponse, WhatsappPhoneNumber } from "./types"

export type WhatsappConfig = BaseConfig & {
  appSecret: string
  webhookVerifyToken: string
}

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    businessId?: string
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
  uploadMedia: Handler<{ ctx: Context<WhatsappAuthValue>; file: File }, string>
  receiveMessage: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      data: OnMessageArgs
    },
    {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction?: { flowVersionId: string; buttonId: string } | null
    }
  >
  sendMessage: (props: SendMessageProps<WhatsappAuthValue>) => Promise<void>
  sendFlowStep: (props: SendFlowStepProps<WhatsappAuthValue>) => Promise<void>
  listMessageTemplates: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { limit: number }
    },
    ListMessageTemplatesReponse
  >
  createMessageTemplate: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      data: CreateMessageTemplateProps
    },
    MessageTemplateEntity
  >
  getFlows: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { limit: number }
    },
    ListFlowsResponse
  >
  getIceBreakers: Handler<
    {
      ctx: Context<WhatsappAuthValue>
    },
    string[]
  >
  updateIceBreaker: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      prompts: string[]
    },
    void
  >
}
