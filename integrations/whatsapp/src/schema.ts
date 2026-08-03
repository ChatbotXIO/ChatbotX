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
  next?: string
}

/**
 * Stand-in cursors for list helpers that already walked every page, so there is
 * no further page for a caller to request.
 *
 * Frozen because every such response hands out this same instance: a caller
 * that mutated it would silently rewrite the cursors of every other response.
 */
export const EMPTY_PAGINATION: WhatsappPagination = Object.freeze({
  cursors: Object.freeze({ before: "", after: "" }),
})

export type WhatsappFlow = {
  id: string
  name: string
  status: string
  categories: string[]
  validation_errors: unknown[]
}

export type ListFlowsResponse = {
  data: WhatsappFlow[]
  paging: WhatsappPagination
}

export type WhatsappFlowScreenOutput = {
  value: string
  label: string
}

export type WhatsappFlowScreen = {
  id: string
  title: string
  terminal: boolean
  output: WhatsappFlowScreenOutput[]
}

export type FlowAssetEntity = {
  name: string
  asset_type: string
  download_url: string
}

export type FlowAssetsResponse = {
  data: FlowAssetEntity[]
}

export type MessageTemplateEntity = {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  components: JSON[]
}

export type ListMessageTemplatesReponse = {
  data: MessageTemplateEntity[]
  paging: {
    next: string
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
  // NAMED-template placeholder name ({{order_id}}); Meta rejects a named
  // template when this is missing. Absent for positional ({{1}}) templates.
  parameter_name?: string
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

/**
 * Meta: "Cards must include either one URL button, or one or more quick-reply
 * buttons." The two are separate shapes rather than one shape with optional
 * fields, so a card carrying both kinds has no valid payload at all.
 */
export type CarouselCardAction =
  | {
      buttons: Array<{
        type: "quick_reply"
        quick_reply: { id: string; title: string }
      }>
    }
  | {
      name: "cta_url"
      parameters: { display_text: string; url: string }
    }

export type CarouselCard = {
  card_index: number
  type: "cta_url"
  header?: {
    type: "image"
    image: { link: string }
  }
  body?: { text: string }
  action?: CarouselCardAction
}

export type InteractiveCarouselMessage = {
  _type: "interactive_carousel"
  type: "interactive"
  interactive: {
    type: "carousel"
    body: { text: string }
    action: { cards: CarouselCard[] }
  }
}

/** Messages posted raw because whatsapp-api-js does not model their payloads. */
export type RawWhatsappMessage = InteractiveCarouselMessage | TemplateMessage

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
  getFlowAssets: Handler<
    {
      ctx: Context<WhatsappAuthValue>
      params: { flowSourceId: string }
    },
    WhatsappFlowScreen[]
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
