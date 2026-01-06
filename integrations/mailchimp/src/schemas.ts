import type {
  Context,
  Handler,
  Oauth2AuthValue,
  Oauth2Config,
} from "@aha.chat/sdk"

export type MailchimpConfig = Oauth2Config & {
  stateParams?: {
    chatbotId: string
    referer: string
  }
}

export type MailchimpAuthValue = Oauth2AuthValue & {
  server: string // This stores the datacenter (dc), e.g., 'us1'
}

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

export type MailchimpMemberResource = {
  id: string
  email_address: string
  unique_email_id: string
  contact_id: string
  full_name: string
  web_id: number
  email_type: string
  status: string
  merge_fields: Record<string, unknown>
  interests: Record<string, boolean>
  stats: {
    avg_open_rate: number
    avg_click_rate: number
    ecommerce_data: {
      total_revenue: number
      number_of_orders: number
      currency_code: string
    }
  }
  ip_signup: string
  timestamp_signup: string
  ip_opt: string
  timestamp_opt: string
  member_rating: number
  last_changed: string
  language: string
  vip: boolean
  email_client: string
  location: {
    latitude: number
    longitude: number
    gmtoff: number
    dstoff: number
    country_code: string
    timezone: string
    region: string
  }
  source: string
  tags_count: number
  tags: { id: number; name: string }[]
  list_id: string
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
