import type {
  BaseConfig,
  Context,
  Handler,
  Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import type { ServerMessage } from "whatsapp-api-js/types"
import z from "zod"
import type {
  ConversationalAutomation,
  WhatsappPhoneNumber,
} from "./api/phone-number"
import type { ListFlowsResponse, ListMessageTemplatesReponse } from "./api/waba"

export type WhatsappConfig = BaseConfig & {
  verifyToken?: string
  clientSecret?: string
}

export type WhatsappAuthValue = Oauth2AuthValue & {
  metadata: {
    wabaId: string
    businessId: string
    phoneNumber: WhatsappPhoneNumber
    webhookUrl: string
    isManual?: boolean
    webhookVerifiedAt?: string
    subscribeOverrideOk?: boolean
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

export const whatsappStatusWebhookEventSchema = z.object({
  phoneID: z.string(),
  phone: z.string(),
  messageId: z.string(),
  status: z.string(),
  error: z
    .object({
      code: z.number(),
      title: z.string(),
      message: z.string(),
      href: z.string(),
      error_data: z.object({
        details: z.string(),
      }),
    })
    .optional(),
})
export type WhatsappStatusWebhookEvent = z.infer<
  typeof whatsappStatusWebhookEventSchema
>

export type WhatsAppTemplateComponentParameter = {
  type: string
  text?: string
  image?: { link: string }
  video?: { link: string }
  document?: { link: string }
  location?: {
    latitude: string
    longitude: string
    name?: string
    address?: string
  }
  coupon_code?: string
  payload?: string
  action?: {
    flow_token?: string
    flow_action_data?: Record<string, unknown>
    thumbnail_product_retailer_id?: string
    sections?: Array<{
      title?: string
      product_items?: Array<{
        product_retailer_id: string
      }>
    }>
  }
}

export type WhatsAppTemplateComponent = {
  type: string
  parameters?: WhatsAppTemplateComponentParameter[]
  sub_type?: string
  index?: number
  cards?: Array<{
    card_index: number
    components: WhatsAppTemplateComponent[]
  }>
}

export type TemplateMessage = {
  _type: "template"
  type: "template"
  template: {
    name: string
    language: { code: string }
    components: WhatsAppTemplateComponent[]
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
  listMessageTemplates: Handler<
    {
      ctx: Context<WhatsappAuthValue>
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
