import type { Context, Handler } from "@aha.chat/sdk"
import { AuthType } from "@aha.chat/sdk"
import { z } from "zod"

export type MailchimpConfig = {
  clientId: string
  clientSecret: string
  redirectUrl: string
  stateParams?: {
    chatbotId: string
    referer: string
  }
}

export const mailchimpAuthValueSchema = z.object({
  authType: z.literal(AuthType.secretText),
  secretText: z.string(),
  metadata: z.object({
    server: z.string(), // This stores the datacenter (dc), e.g., 'us1'
  }),
})

export type MailchimpAuthValue = z.infer<typeof mailchimpAuthValueSchema>

export type MailchimpAudienceResource = {
  id: string
  name: string
}

export type MailchimpTagResource = {
  id: number
  name: string
}

export type MailchimpMergeFieldResource = {
  tag: string
  name: string
  type: string
}

export const mailchimpMemberResourceSchema = z.object({
  id: z.string(),
  email_address: z.string(),
  unique_email_id: z.string(),
  contact_id: z.string(),
  full_name: z.string(),
  web_id: z.number(),
  email_type: z.string(),
  status: z.string(),
  merge_fields: z.record(z.string(), z.unknown()),
  interests: z.record(z.string(), z.boolean()).optional(),
  stats: z
    .object({
      avg_open_rate: z.number(),
      avg_click_rate: z.number(),
      ecommerce_data: z
        .object({
          total_revenue: z.number(),
          number_of_orders: z.number(),
          currency_code: z.string(),
        })
        .optional(),
    })
    .optional(),
  ip_signup: z.string().optional(),
  timestamp_signup: z.string().optional(),
  ip_opt: z.string().optional(),
  timestamp_opt: z.string().optional(),
  member_rating: z.number().optional(),
  last_changed: z.string().optional(),
  language: z.string().optional(),
  vip: z.boolean().optional(),
  email_client: z.string().optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      gmtoff: z.number(),
      dstoff: z.number(),
      country_code: z.string(),
      timezone: z.string(),
      region: z.string(),
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
