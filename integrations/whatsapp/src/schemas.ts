import type {
  BaseConfig,
  Context,
  Handler,
  Oauth2AuthValue,
  SendFlowStepProps,
} from "@aha.chat/sdk"
import type { ServerMessage } from "whatsapp-api-js/types"
import z from "zod"
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

export const whatsappWebhookEventSchema = z.object({
  phoneID: z.string(), // bot phone number id
  from: z.string(), // user phone number
  message: z.object().transform((data) => data as unknown as ServerMessage),
  name: z.string().optional(), // user name
})
export type WhatsappWebhookEvent = z.infer<typeof whatsappWebhookEventSchema>

export type WhatsappActions = {
  verifyAccessToken: Handler<
    {
      ctx: Context<WhatsappAuthValue>
    },
    WhatsappPhoneNumber
  >
  uploadMedia: Handler<{ ctx: Context<WhatsappAuthValue>; file: File }, string>
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
