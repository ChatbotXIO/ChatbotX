import type { Context, Handler, Oauth2Config } from "@aha.chat/sdk"
import { AuthType } from "@aha.chat/sdk"
import { z } from "zod"

export const mailchimpAuthValueSchema = z.object({
  authType: z.literal(AuthType.oauth2),
  clientId: z.string().trim(),
  clientSecret: z.string().trim(),
  redirectUrl: z.string().trim(),
  tokens: z.object({
    accessToken: z.string().trim(),
  }),
  server: z.string().trim(),
})

export type MailchimpAuthValue = z.infer<typeof mailchimpAuthValueSchema>

export const mailchimpAudienceResourceSchema = z.object({
  id: z.string().trim(),
  name: z.string().trim(),
})

export type MailchimpAudienceResource = z.infer<
  typeof mailchimpAudienceResourceSchema
>

export const mailchimpTagResourceSchema = z.object({
  id: z.number(),
  name: z.string().trim(),
})

export type MailchimpTagResource = z.infer<typeof mailchimpTagResourceSchema>

export const mailchimpMergeFieldResourceSchema = z.object({
  tag: z.string().trim(),
  name: z.string().trim(),
  type: z.string().trim(),
})

export type MailchimpMergeFieldResource = z.infer<
  typeof mailchimpMergeFieldResourceSchema
>

export const mailchimpMemberResourceSchema = z.object({
  id: z.string().trim(),
  email_address: z.string().trim(),
  unique_email_id: z.string().trim().optional(),
  contact_id: z.string().trim().optional(),
  full_name: z.string().trim().optional(),
  web_id: z.number().optional(),
  email_type: z.string().trim().optional(),
  status: z.string().trim().optional(),
  merge_fields: z.record(z.string(), z.unknown()).optional(),
  interests: z.record(z.string(), z.boolean()).optional(),
  stats: z
    .object({
      avg_open_rate: z.number().optional(),
      avg_click_rate: z.number().optional(),
      ecommerce_data: z
        .object({
          total_revenue: z.number().optional(),
          number_of_orders: z.number().optional(),
          currency_code: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  ip_signup: z.string().trim().optional(),
  timestamp_signup: z.string().trim().optional(),
  ip_opt: z.string().trim().optional(),
  timestamp_opt: z.string().trim().optional(),
  member_rating: z.number().optional(),
  last_changed: z.string().trim().optional(),
  language: z.string().trim().optional(),
  vip: z.boolean().optional(),
  email_client: z.string().trim().optional(),
  location: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      gmtoff: z.number().optional(),
      dstoff: z.number().optional(),
      country_code: z.string().trim().optional(),
      timezone: z.string().optional(),
      region: z.string().trim().optional(),
    })
    .optional(),
  source: z.string().optional(),
  tags_count: z.number().optional(),
  tags: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  list_id: z.string().optional(),
})

export type MailchimpMemberResource = z.infer<
  typeof mailchimpMemberResourceSchema
>

export type MailchimpConfig = Oauth2Config & {
  stateParams?: {
    chatbotId: string
    referer: string
  }
}

export type MailchimpActions = {
  addMember: Handler<
    {
      ctx: Context<MailchimpAuthValue>
      props: {
        listId: string
        email: string
        status?:
          | "subscribed"
          | "unsubscribed"
          | "cleaned"
          | "pending"
          | "transactional"
        tags?: string[]
        mergeFields?: Record<string, unknown>
        skipMergeValidation?: boolean
      }
    },
    MailchimpMemberResource
  >
  listAudiences: Handler<
    { ctx: Context<MailchimpAuthValue> },
    MailchimpAudienceResource[]
  >
  listTags: Handler<
    { ctx: Context<MailchimpAuthValue>; props: { listId: string } },
    MailchimpTagResource[]
  >
  listMergeFields: Handler<
    { ctx: Context<MailchimpAuthValue>; props: { listId: string } },
    MailchimpMergeFieldResource[]
  >
}
