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
import type { ServerMessage } from "whatsapp-api-js/types"
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
    webhookUrl: string
  }
}

export type WhatsappPagination = {
  cursors: {
    before: string
    after: string
  }
}

export type WhatsappWebhookEvent = {
  /**
   * The bot's phoneID
   */
  phoneID: string
  /**
   * The user's phone number
   */
  from: string
  /**
   * The messages object
   */
  message: ServerMessage
  /**
   * The username
   */
  name?: string
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
      data: WhatsappWebhookEvent
    },
    {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction: string | null
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
