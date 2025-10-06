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
  ConversationalAutomation,
  WhatsappPhoneNumber,
} from "./api/phone-number"
import type { ListFlowsResponse, ListMessageTemplatesReponse } from "./api/waba"

export type WhatsappConfig = BaseConfig & {
  verifyToken?: string
}

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    businessId: string
    phoneNumber: WhatsappPhoneNumber
  }
}

export type WhatsappPagination = {
  cursors: {
    before: string
    after: string
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
  listFlows: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { limit: number }
    },
    ListFlowsResponse
  >
  findConversationalAutomation: Handler<
    {
      ctx: Context<WhatsappAuthValue>
    },
    ConversationalAutomation
  >
  updateConversationalAutomation: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      data: ConversationalAutomation
    },
    void
  >
}
