import type { Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"
import { z } from "zod"

export type TiktokConfig = Oauth2Config & {
  openId?: string
}

export type TiktokAuthValue = Oauth2AuthValue & {
  metadata: {
    openId: string
    username: string
    displayName: string
  }
}

export type TiktokActions = Record<string, never>

// ─── Webhook event schemas ────────────────────────────────────────────────────

export const tiktokWebhookEventSchema = z.object({
  client_key: z.string(),
  event: z.string(),
  create_time: z.number(),
  user_openid: z.string(),
  content: z.string(),
})
export type TiktokWebhookEvent = z.infer<typeof tiktokWebhookEventSchema>

export const tiktokDmMessageContentSchema = z.object({
  from: z.string().optional(),
  from_user: z.object({
    id: z.string(),
    role: z.string().optional(),
  }),
  to: z.string().optional(),
  to_user: z
    .object({
      id: z.string(),
      role: z.string().optional(),
    })
    .optional(),
  conversation_id: z.string(),
  message_id: z.string().optional(),
  unique_identifier: z.string().optional(),
  timestamp: z.number().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  media_url: z.string().optional(),
  reply_source_payload: z
    .object({
      reply_source_msg_id: z.string(),
      reply_source_unique_id: z.string(),
    })
    .optional(),
})
export type TiktokDmMessageContent = z.infer<
  typeof tiktokDmMessageContentSchema
>

// ─── API response schemas ─────────────────────────────────────────────────────

// business-api.tiktok.com wraps every response as { code, message, data },
// distinct from open.tiktokapis.com's { data, error } (TiktokApiResponse below)
// — a rejection still comes back HTTP 200, so `code` must be checked explicitly.
export type BusinessApiResponse<T> = {
  code: number
  message?: string
  data: T
}

export const tiktokApiResponseSchema = z.object({
  data: z.unknown(),
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
      log_id: z.string().optional(),
    })
    .optional(),
})
export type TiktokApiResponse<T = unknown> = {
  data: T
  error?: { code?: string | number; message?: string; log_id?: string }
}

export type TiktokUserInfo = {
  open_id: string
  display_name: string
  avatar_url: string
  username: string
}

export type TiktokTemplateButton = {
  type: "REPLY"
  title: string
  id: string
}

export type TiktokMessageTemplate =
  | { type: "QA_BUTTON_CARD"; title: string; buttons: TiktokTemplateButton[] }
  | { type: "QA_LINK_CARD"; title: string; buttons: TiktokTemplateButton[] }

export type TiktokSendMessageRequest =
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "TEXT"
      text: { body: string }
    }
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "IMAGE"
      image: { media_id: string }
    }
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "TEMPLATE"
      template: TiktokMessageTemplate
    }
