import type {
  Context,
  IncomingContact,
  Oauth2AuthValue,
  Oauth2Config,
  SendFlowStepProps,
} from "@aha.chat/sdk"
import { z } from "zod"

export const MESSENGER_MESSAGE_METADATA = "SENT_FROM_CHATBOTX"

export type MessengerConfig = Oauth2Config & {
  verifyToken?: string
  version: string
  stateParams: {
    chatbotId: string
  }
}

export type MessengerAuthValue = Oauth2AuthValue & {
  metadata: {
    pageId: string
    pageName: string
    version: string
  }
}

export type MessengerActions = {
  sendFlowStep: (props: SendFlowStepProps<MessengerAuthValue>) => Promise<void>
  getUserProfile: (props: {
    ctx: Context<MessengerAuthValue>
    psid: string
  }) => Promise<IncomingContact>
}

// Common attachment types
const attachmentTypeSchema = z.enum(["image", "video", "audio", "file"])

// Base attachment payload
const baseAttachmentPayloadSchema = z.object({
  url: z.url(),
})

// Common ID schemas
const idSchema = z.object({
  id: z.string(),
})

export const messengerAttachmentSchema = z.object({
  type: attachmentTypeSchema,
  payload: baseAttachmentPayloadSchema,
})
export type MessengerAttachment = z.infer<typeof messengerAttachmentSchema>

export const messengerMessageSchema = z.object({
  mid: z.string(),
  text: z.string().optional(),
  is_echo: z.boolean().optional(),
  attachments: z.array(messengerAttachmentSchema).optional(),
  metadata: z.string().optional(),
  quick_reply: z
    .object({
      payload: z.string(),
    })
    .optional(),
})
export type MessengerMessage = z.infer<typeof messengerMessageSchema>

export const messengerDeliverySchema = z.object({
  mids: z.array(z.string()),
  watermark: z.number(),
})

export const messengerReadSchema = z.object({
  watermark: z.number(),
})

export const messengerPostbackSchema = z.object({
  mid: z.string(),
  title: z.string(),
  payload: z.string(),
})

const messengerReferralSchema = z.object({
  ref: z.string(),
})

export const messengerMessagingEventSchema = z.object({
  sender: idSchema,
  recipient: idSchema,
  timestamp: z.number(),
  message: messengerMessageSchema.optional(),
  delivery: messengerDeliverySchema.optional(),
  read: messengerReadSchema.optional(),
  postback: messengerPostbackSchema.optional(),
  referral: messengerReferralSchema.optional(),
})
export type MessengerMessagingEvent = z.infer<
  typeof messengerMessagingEventSchema
>

export const messengerPageEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  messaging: z.array(messengerMessagingEventSchema),
})
export type MessengerPageEntry = z.infer<typeof messengerPageEntrySchema>

export const messengerWebhookEventSchema = z.object({
  object: z.literal("page"),
  entry: z.array(messengerPageEntrySchema),
})
export type MessengerWebhookEvent = z.infer<typeof messengerWebhookEventSchema>

export const facebookQuickReplySchema = z.object({
  content_type: z.enum(["text", "location", "user_phone_number"]),
  title: z.string().optional(),
  payload: z.string().optional(),
  image_url: z.url().optional(),
})
export type FacebookQuickReply = z.infer<typeof facebookQuickReplySchema>

export const facebookButtonSchema = z.object({
  type: z.enum(["web_url", "postback", "phone_number"]),
  title: z.string(),
  url: z.url().optional(),
  payload: z.string().optional(),
})
export type FacebookButton = z.infer<typeof facebookButtonSchema>

export const facebookElementSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image_url: z.url().optional(),
  default_action: z
    .object({
      type: z.literal("web_url"),
      url: z.url(),
    })
    .optional(),
  buttons: z.array(facebookButtonSchema).max(3).optional(),
})
export type FacebookElement = z.infer<typeof facebookElementSchema>

export const facebookMessageAttachmentPayloadSchema = z.object({
  url: z.url().optional(),
  is_reusable: z.boolean().optional(),
  template_type: z
    .enum([
      "generic",
      "button",
      "media",
      "receipt",
      "airline_boardingpass",
      "airline_checkin",
      "airline_itinerary",
      "airline_update",
    ])
    .optional(),
  text: z.string().optional(),
  buttons: z.array(facebookButtonSchema).optional(),
  elements: z.array(facebookElementSchema).optional(),
  attachment_id: z.string().optional(),
})
export type FacebookMessageAttachmentPayload = z.infer<
  typeof facebookMessageAttachmentPayloadSchema
>

export const facebookMessageAttachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file", "template"]),
  payload: facebookMessageAttachmentPayloadSchema,
})
export type FacebookMessageAttachment = z.infer<
  typeof facebookMessageAttachmentSchema
>

export const facebookMessageSchema = z.object({
  text: z.string().optional(),
  attachment: facebookMessageAttachmentSchema.optional(),
  quick_replies: z.array(facebookQuickReplySchema).max(13).optional(),
  metadata: z.string().optional(),
})
export type FacebookMessage = z.infer<typeof facebookMessageSchema>

export const facebookRecipientSchema = z.object({
  id: z.string().optional(),
  phone_number: z.string().optional(),
  name: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
    })
    .optional(),
})
export type FacebookRecipient = z.infer<typeof facebookRecipientSchema>

export const facebookSendMessageRequestSchema = z.object({
  recipient: facebookRecipientSchema,
  message: facebookMessageSchema.optional(),
  sender_action: z.enum(["typing_on", "typing_off", "mark_seen"]).optional(),
  messaging_type: z
    .enum(["RESPONSE", "UPDATE", "MESSAGE_TAG"])
    .default("RESPONSE")
    .optional(),
  tag: z
    .enum([
      "COMMUNITY_ALERT",
      "CONFIRMED_EVENT_UPDATE",
      "NON_PROMOTIONAL_SUBSCRIPTION",
      "PAIRING_UPDATE",
      "APPLICATION_UPDATE",
      "ACCOUNT_UPDATE",
      "PAYMENT_UPDATE",
      "PERSONAL_FINANCE_UPDATE",
      "SHIPPING_UPDATE",
      "RESERVATION_UPDATE",
      "ISSUE_RESOLUTION",
      "APPOINTMENT_UPDATE",
      "GAME_EVENT",
      "TRANSPORTATION_UPDATE",
      "FEATURE_FUNCTIONALITY_UPDATE",
      "TICKET_UPDATE",
    ])
    .optional(),
  notification_type: z.enum(["REGULAR", "SILENT_PUSH", "NO_PUSH"]).optional(),
  persona_id: z.string().optional(),
})
export type FacebookSendMessageRequest = z.infer<
  typeof facebookSendMessageRequestSchema
>

export const facebookSendMessageResponseSchema = z.object({
  recipient_id: z.string(),
  message_id: z.string().optional(),
  attachment_id: z.string().optional(),
})
export type FacebookSendMessageResponse = z.infer<
  typeof facebookSendMessageResponseSchema
>

export const facebookErrorSchema = z.object({
  message: z.string(),
  type: z.string(),
  code: z.number(),
  error_subcode: z.number().optional(),
  fbtrace_id: z.string().optional(),
})
export type FacebookError = z.infer<typeof facebookErrorSchema>

export const facebookGraphAPIErrorSchema = z.object({
  error: facebookErrorSchema,
})
export type FacebookGraphAPIError = z.infer<typeof facebookGraphAPIErrorSchema>

// Facebook User Profile schema
export const facebookUserProfileSchema = z.object({
  id: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  name: z.string().optional(),
  profile_pic: z.url().optional(),
  locale: z.string().optional(),
  timezone: z.number().optional(),
  gender: z.string().optional(),
})
export type FacebookUserProfile = z.infer<typeof facebookUserProfileSchema>

// Facebook Page schema
export const facebookPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  category: z.string().optional(),
  category_list: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  tasks: z.array(z.string()).optional(),
})
export type FacebookPage = z.infer<typeof facebookPageSchema>

// Webhook verification schemas
export const webhookVerificationRequestSchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.challenge": z.string(),
  "hub.verify_token": z.string(),
})
export type WebhookVerificationRequest = z.infer<
  typeof webhookVerificationRequestSchema
>

// Message processing queue schemas
export const processMessageQueueDataSchema = z.object({
  messageId: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  pageId: z.string(),
  text: z.string().optional(),
  attachments: z.array(messengerAttachmentSchema).optional(),
  config: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    accessToken: z.string(),
    verifyToken: z.string(),
    version: z.string(),
  }),
})
export type ProcessMessageQueueData = z.infer<
  typeof processMessageQueueDataSchema
>

export const processDeliveryQueueDataSchema = z.object({
  messageIds: z.array(z.string()),
  senderId: z.string(),
  pageId: z.string(),
  watermark: z.number(),
  config: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    accessToken: z.string(),
    verifyToken: z.string(),
    version: z.string(),
  }),
})
export type ProcessDeliveryQueueData = z.infer<
  typeof processDeliveryQueueDataSchema
>

export const processReadQueueDataSchema = z.object({
  senderId: z.string(),
  pageId: z.string(),
  watermark: z.number(),
  config: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    accessToken: z.string(),
    verifyToken: z.string(),
    version: z.string(),
  }),
})
export type ProcessReadQueueData = z.infer<typeof processReadQueueDataSchema>

export const processPostbackQueueDataSchema = z.object({
  senderId: z.string(),
  recipientId: z.string(),
  pageId: z.string(),
  title: z.string(),
  payload: z.string(),
  config: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    accessToken: z.string(),
    verifyToken: z.string(),
    version: z.string(),
  }),
})
export type ProcessPostbackQueueData = z.infer<
  typeof processPostbackQueueDataSchema
>

// OAuth and authentication schemas
export const messengerOAuthCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})
export type MessengerOAuthCallback = z.infer<
  typeof messengerOAuthCallbackSchema
>

export const facebookAccessTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
  expires_in: z.number().optional(),
})
export type FacebookAccessTokenResponse = z.infer<
  typeof facebookAccessTokenResponseSchema
>

// Integration response schemas
export const messengerIntegrationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
})
export type MessengerIntegrationResponse = z.infer<
  typeof messengerIntegrationResponseSchema
>

// Select page request schema (for UI)
export const selectPageRequestSchema = z.object({
  pageId: z.string().min(1, "Please select a Facebook page"),
  pageName: z.string().min(1, "Page name is required"),
  accessToken: z.string().min(1, "Page access token is required"),
})
export type SelectPageRequest = z.infer<typeof selectPageRequestSchema>
