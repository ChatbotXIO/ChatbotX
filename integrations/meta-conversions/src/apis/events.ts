import type {
  HashedCapiUserData,
  MetaCapiActionSource,
  MetaCapiContentType,
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

// Fields shared by every action source. `contentType`/`contentIds` are new;
// the rest carry over unchanged from the previous per-variant literals.
type MetaCapiEventCommon = {
  eventName: MetaCapiEventName
  occurredAt: Date
  eventId: string
  currency?: string | null
  value?: string | number | null
  contentCategory?: string | null
  contentName?: string | null
  /** `custom_data.content_type` — explicit value wins over the
   * `contents[]`-derived `"product"` default (see `buildCustomData`). */
  contentType?: MetaCapiContentType | null
  /** `custom_data.content_ids`. */
  contentIds?: string[] | null
  /** Hashed customer-info. For a business-messaging event it is merged into
   * `user_data` alongside the channel identity keys; for a non-messaging
   * event it IS `user_data` (identity keys don't exist there). */
  userData?: HashedCapiUserData
  /** Limited Data Use — emits the fixed top-level LDU triple. */
  limitedDataUse?: boolean
  /** Purchase order id — `custom_data.order_id`. */
  orderId?: string | null
  /** Purchase line items — `custom_data.contents[]`. */
  contents?: PurchaseContentItem[] | null
}

// The three channel-identity shapes business-messaging events can carry.
// `actionSource` is OPTIONAL and fixed to `"business_messaging"` here so the
// ads-conversion sender (`apps/worker/.../ads-conversion/send-conversion-
// event.ts`, which never sets it) and every existing test keep compiling
// unchanged.
type BusinessMessagingIdentity = {
  actionSource?: "business_messaging"
} & (
  | {
      messagingChannel: "messenger"
      pageId: string
      pageScopedUserId: string
    }
  | {
      messagingChannel: "instagram"
      instagramBusinessAccountId: string
      igSid: string
    }
  | {
      messagingChannel: "whatsapp"
      wabaId: string
      ctwaClid: string
    }
)

// Every other action source: no messaging channel, no channel identity keys
// — Meta rejects `page_scoped_user_id`/`ig_sid`/`ctwa_clid` on a non-
// messaging event, so the union makes that combination unrepresentable.
// `userData` is REQUIRED here (unlike the business-messaging arm, which
// identifies the person via its channel identity keys and treats hashed
// customer info as an optional supplement): a non-messaging event has no
// other identity to send, so it must never type-check without one.
type NonMessagingIdentity = {
  actionSource: Exclude<MetaCapiActionSource, "business_messaging">
  userData: HashedCapiUserData
}

export type MetaConversionEventInput = MetaCapiEventCommon &
  (BusinessMessagingIdentity | NonMessagingIdentity)

// The business-messaging arm of `MetaConversionEventInput`, distributed over
// `messagingChannel` — used by `channelUserDataBuilders` and its dispatcher.
type MetaMessagingEventInput = MetaCapiEventCommon & BusinessMessagingIdentity
type MessengerEventInput = Extract<
  MetaMessagingEventInput,
  { messagingChannel: "messenger" }
>
type InstagramEventInput = Extract<
  MetaMessagingEventInput,
  { messagingChannel: "instagram" }
>
type WhatsappEventInput = Extract<
  MetaMessagingEventInput,
  { messagingChannel: "whatsapp" }
>

type SendConversionEventInput = {
  datasetId: string
  accessToken: string
  version?: string
  event: MetaConversionEventInput
  /**
   * Meta's `test_event_code` (Events Manager → Test events). When set, the
   * event is routed to the dataset's Test Events view instead of production
   * reporting, where its full payload is shown.
   */
  testEventCode?: string
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
  messenger: (event: MessengerEventInput) => ({
    page_id: event.pageId,
    page_scoped_user_id: event.pageScopedUserId,
  }),
  instagram: (event: InstagramEventInput) => ({
    // Live business_messaging endpoint requires `ig_account_id`; it rejects the
    // event as "Missing IG account ID parameter" (error_subcode 2804079) when
    // only `instagram_business_account_id` is sent, even though the public doc
    // example still lists the latter. We send BOTH (same value): the live API
    // requires `ig_account_id` and tolerates the doc-named key as unknown, so
    // this stays correct whichever name Meta consolidates on.
    ig_account_id: event.instagramBusinessAccountId,
    instagram_business_account_id: event.instagramBusinessAccountId,
    ig_sid: event.igSid,
  }),
  whatsapp: (event: WhatsappEventInput) => ({
    whatsapp_business_account_id: event.wabaId,
    ctwa_clid: event.ctwaClid,
  }),
} as const satisfies {
  [Channel in MetaMessagingChannel]: (
    event: Extract<MetaMessagingEventInput, { messagingChannel: Channel }>,
  ) => Record<string, string>
}

// Indexing `channelUserDataBuilders` by `event.messagingChannel` (a union
// key) narrows each builder's parameter to the INTERSECTION of all three
// channels' identity fields — a shape no single event value can satisfy
// structurally, even though the `messagingChannel` tag guarantees the match
// is safe at runtime. This is the ONE documented cast in this file,
// replacing the three per-variant `as MessengerEventInput` /
// `as InstagramEventInput` / `as WhatsappEventInput` casts that used to live
// inside each builder body.
const byMessagingChannel = (
  event: MetaMessagingEventInput,
  builders: typeof channelUserDataBuilders,
): Record<string, string> => {
  const builder = builders[event.messagingChannel] as (
    event: MetaMessagingEventInput,
  ) => Record<string, string>
  return builder(event)
}

// Purchase `content_type`/`num_items`/`contents[]`. `num_items` is
// the SUM of each line item's quantity — NOT the array length, per Meta's
// spec (a line item can itself represent multiple units of the same SKU).
// `content_type` itself is resolved by `buildCustomData` (explicit value
// wins over this default), not hard-coded here.
const buildContentsData = (contents: PurchaseContentItem[]) => ({
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
  const hasContentIds = Boolean(event.contentIds && event.contentIds.length > 0)
  // Explicit `contentType` wins over the `contents[]`-derived "product"
  // default.
  const contentType = event.contentType ?? (hasContents ? "product" : undefined)
  const hasAny =
    event.currency ||
    hasValue ||
    event.contentCategory ||
    event.contentName ||
    event.orderId ||
    hasContents ||
    hasContentIds ||
    contentType
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
          ...(contentType ? { content_type: contentType } : {}),
          ...(hasContentIds ? { content_ids: event.contentIds } : {}),
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
const buildChannelUserData = (event: MetaMessagingEventInput) => ({
  ...byMessagingChannel(event, channelUserDataBuilders),
  ...(event.userData ?? {}),
})

// Limited Data Use: a FIXED top-level triple, never arbitrary
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

// Structural discriminant: `actionSource` is optional on
// `BusinessMessagingIdentity`, so a `Record<MetaCapiActionSource, handler>`
// cannot narrow it — `messagingChannel` presence is the reliable tag.
function isBusinessMessagingEvent(
  event: MetaConversionEventInput,
): event is MetaMessagingEventInput {
  return "messagingChannel" in event
}

const businessMessagingIdentityPayload = (event: MetaMessagingEventInput) => ({
  action_source: "business_messaging" as const,
  messaging_channel: event.messagingChannel,
  user_data: buildChannelUserData(event),
})

// Non-messaging `user_data` is hashed customer info only — it can never be
// empty because the business layer always emits `external_id`, which Meta
// lists among the parameters satisfying its "at least one of" rule.
const nonMessagingIdentityPayload = (
  event: MetaCapiEventCommon & NonMessagingIdentity,
) => ({
  action_source: event.actionSource,
  user_data: event.userData,
})

const buildConversionEventPayload = (event: MetaConversionEventInput) => ({
  event_name: event.eventName,
  event_time: Math.floor(event.occurredAt.getTime() / 1000),
  event_id: event.eventId,
  ...(isBusinessMessagingEvent(event)
    ? businessMessagingIdentityPayload(event)
    : nonMessagingIdentityPayload(event)),
  ...buildCustomData(event),
  ...buildDataProcessingOptions(event),
})

export const sendConversionEvent = ({
  datasetId,
  accessToken,
  version = DEFAULT_API_VERSION,
  event,
  testEventCode,
}: SendConversionEventInput): Promise<void> =>
  rescueMetaConversions(async () => {
    const response = await metaConversionsGraphClient.post<unknown>(
      `${version}/${datasetId}/events`,
      {
        headers: graphAuthHeaders(accessToken),
        json: {
          data: [buildConversionEventPayload(event)],
          partner_agent: META_CONVERSIONS_PARTNER_AGENT,
          ...(testEventCode ? { test_event_code: testEventCode } : {}),
        },
      },
    )

    conversionEventsResponseSchema.parse(response.data)
  })
