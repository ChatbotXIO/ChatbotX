import type {
  HashedCapiUserData,
  PurchaseContentItem,
} from "@chatbotx.io/utils/meta-capi"
import { z } from "zod"
import {
  DEFAULT_API_VERSION,
  META_CONVERSIONS_PARTNER_AGENT,
} from "../constants"
import { rescueMetaConversions } from "../exception"
import {
  graphAuthHeaders,
  metaConversionsGraphClient,
} from "../lib/http-client"
import type { MetaCapiEventName, MetaMessagingChannel } from "../schemas"

// Shared enrichment fields (plan #1/#3/#4) duplicated per channel-variant
// literal below, mirroring this file's pre-existing pattern of duplicating
// currency/value/contentCategory/contentName across the three variants
// rather than a common base type.
type MetaCapiEnrichmentFields = {
  /** Hashed customer-info (plan #1) — merged into the channel's `user_data`. */
  userData?: HashedCapiUserData
  /** Limited Data Use (plan #3) — emits the fixed top-level LDU triple. */
  limitedDataUse?: boolean
  /** Purchase order id (plan #4) — `custom_data.order_id`. */
  orderId?: string | null
  /** Purchase line items (plan #4) — `custom_data.contents[]`. */
  contents?: PurchaseContentItem[] | null
}

type MessengerEventInput = {
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  messagingChannel: "messenger"
  pageId: string
  pageScopedUserId: string
  currency?: string | null
  value?: string | number | null
  contentCategory?: string | null
  contentName?: string | null
} & MetaCapiEnrichmentFields

type InstagramEventInput = {
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  messagingChannel: "instagram"
  instagramBusinessAccountId: string
  igSid: string
  currency?: string | null
  value?: string | number | null
  contentCategory?: string | null
  contentName?: string | null
} & MetaCapiEnrichmentFields

type WhatsappEventInput = {
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  messagingChannel: "whatsapp"
  wabaId: string
  ctwaClid: string
  currency?: string | null
  value?: string | number | null
  contentCategory?: string | null
  contentName?: string | null
} & MetaCapiEnrichmentFields

export type MetaConversionEventInput =
  | MessengerEventInput
  | InstagramEventInput
  | WhatsappEventInput

type SendConversionEventInput = {
  datasetId: string
  accessToken: string
  version?: string
  event: MetaConversionEventInput
}

const conversionEventsResponseSchema = z.object({}).passthrough()

// Verified against Meta Conversions API for Business Messaging docs:
// https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging
// user_data keys: messenger uses page_id + page_scoped_user_id; instagram uses
// ig_account_id (+ instagram_business_account_id for forward-compat) + ig_sid;
// whatsapp uses whatsapp_business_account_id + ctwa_clid (payload identical to
// the existing automatic CTWA pipeline in
// integrations/whatsapp/src/api/conversions.ts). NOTE: the live IG endpoint
// requires `ig_account_id` even though the public doc example still shows
// `instagram_business_account_id` — see the instagram builder below.
const channelUserDataBuilders = {
  messenger: (event: MetaConversionEventInput) => ({
    page_id: (event as MessengerEventInput).pageId,
    page_scoped_user_id: (event as MessengerEventInput).pageScopedUserId,
  }),
  instagram: (event: MetaConversionEventInput) => ({
    // Live business_messaging endpoint requires `ig_account_id`; it rejects the
    // event as "Missing IG account ID parameter" (error_subcode 2804079) when
    // only `instagram_business_account_id` is sent, even though the public doc
    // example still lists the latter. We send BOTH (same value): the live API
    // requires `ig_account_id` and tolerates the doc-named key as unknown, so
    // this stays correct whichever name Meta consolidates on.
    ig_account_id: (event as InstagramEventInput).instagramBusinessAccountId,
    instagram_business_account_id: (event as InstagramEventInput)
      .instagramBusinessAccountId,
    ig_sid: (event as InstagramEventInput).igSid,
  }),
  whatsapp: (event: MetaConversionEventInput) => ({
    whatsapp_business_account_id: (event as WhatsappEventInput).wabaId,
    ctwa_clid: (event as WhatsappEventInput).ctwaClid,
  }),
} as const satisfies {
  [Channel in MetaMessagingChannel]: (
    event: MetaConversionEventInput,
  ) => Record<string, string>
}

// Purchase `content_type`/`num_items`/`contents[]` (plan #4). `num_items` is
// the SUM of each line item's quantity — NOT the array length, per Meta's
// spec (a line item can itself represent multiple units of the same SKU).
const buildContentsData = (contents: PurchaseContentItem[]) => ({
  content_type: "product",
  num_items: contents.reduce((total, item) => total + item.quantity, 0),
  contents: contents.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    item_price: item.itemPrice,
  })),
})

const buildCustomData = (event: MetaConversionEventInput) => {
  const hasValue = event.value !== null && event.value !== undefined
  const hasContents = Boolean(event.contents && event.contents.length > 0)
  const hasAny =
    event.currency ||
    hasValue ||
    event.contentCategory ||
    event.contentName ||
    event.orderId ||
    hasContents
  return hasAny
    ? {
        custom_data: {
          ...(event.currency ? { currency: event.currency } : {}),
          ...(hasValue ? { value: Number(event.value) } : {}),
          ...(event.contentCategory
            ? { content_category: event.contentCategory }
            : {}),
          ...(event.contentName ? { content_name: event.contentName } : {}),
          ...(event.orderId ? { order_id: event.orderId } : {}),
          ...(hasContents && event.contents
            ? buildContentsData(event.contents)
            : {}),
        },
      }
    : {}
}

// Identity keys first, then hashed customer-info fields — the two never
// collide (channel identity keys are page_id/ig_sid/etc, hashed fields are
// em/ph/fn/ln/external_id).
const buildChannelUserData = (event: MetaConversionEventInput) => ({
  ...channelUserDataBuilders[event.messagingChannel](event),
  ...(event.userData ?? {}),
})

// Limited Data Use (plan #3): a FIXED top-level triple, never arbitrary
// caller-supplied processing options — Meta auto-geolocates from this,
// restricting only US-state users covered by state privacy law.
const buildDataProcessingOptions = (event: MetaConversionEventInput) =>
  event.limitedDataUse
    ? {
        data_processing_options: ["LDU"] as const,
        data_processing_options_country: 0,
        data_processing_options_state: 0,
      }
    : {}

const buildConversionEventPayload = (event: MetaConversionEventInput) => ({
  event_name: event.eventName,
  event_time: Math.floor(event.occurredAt.getTime() / 1000),
  event_id: event.eventId,
  action_source: "business_messaging",
  messaging_channel: event.messagingChannel,
  user_data: buildChannelUserData(event),
  ...buildCustomData(event),
  ...buildDataProcessingOptions(event),
})

export const sendConversionEvent = ({
  datasetId,
  accessToken,
  version = DEFAULT_API_VERSION,
  event,
}: SendConversionEventInput): Promise<void> =>
  rescueMetaConversions(async () => {
    const response = await metaConversionsGraphClient.post<unknown>(
      `${version}/${datasetId}/events`,
      {
        headers: graphAuthHeaders(accessToken),
        json: {
          data: [buildConversionEventPayload(event)],
          partner_agent: META_CONVERSIONS_PARTNER_AGENT,
        },
      },
    )

    conversionEventsResponseSchema.parse(response.data)
  })
