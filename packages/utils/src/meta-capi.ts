/**
 * Low-level wire-adjacent types and shared enums for Meta's Conversions API
 * (CAPI) — for both Business Messaging and Pixel/server events. Depends
 * only on zod, like `utils/variables.ts`. Lives here (not `packages/business`)
 * so `integrations/meta-conversions` — which deliberately does NOT depend on
 * `@chatbotx.io/business` — can still import these shapes, and so
 * `packages/database`'s `AdsConversionEvent.contents` / `MetaCapiEvent.*`
 * columns can use the same types their writers do.
 */
import { z } from "zod"

/**
 * Hash-only Meta Conversions API `user_data` customer-information fields.
 * Every present field is a SHA-256 lowercase-hex digest, wrapped in a
 * single-element array, per Meta's Customer Information Parameters spec
 * (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters).
 * Never plaintext PII — values are produced by the contact→hash mapper in
 * `packages/business/src/meta-conversions/hash-user-data.ts`; this type only
 * pins the wire shape both that mapper and the channel payload builders
 * (`integrations/meta-conversions/src/apis/events.ts`,
 * `integrations/whatsapp/src/api/conversions.ts`) agree on.
 */
export type HashedCapiUserData = {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  external_id?: string[]
}

/**
 * One Purchase `custom_data.contents[]` line item. `itemPrice` mirrors
 * Meta's wire `item_price` in camelCase — converted to the wire key at the
 * payload-builder boundary, matching every other camelCase-in/snake_case-out
 * field in the CAPI payload builders.
 */
export type PurchaseContentItem = {
  id: string
  quantity: number
  itemPrice: number
}

/**
 * Meta's 14 documented Business Messaging CAPI events
 * (https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging).
 * Offered only when `action_source` is `business_messaging` — that endpoint's
 * docs list these events and never mention custom event names, so this
 * catalog is closed (no custom names — see `metaCapiActionSourcePolicy`).
 */
export const metaCapiBusinessMessagingEventNames = [
  "Purchase",
  "LeadSubmitted",
  "InitiateCheckout",
  "AddToCart",
  "ViewContent",
  "OrderCreated",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "CartAbandoned",
  "QualifiedLead",
  "RatingProvided",
  "ReviewProvided",
] as const

/**
 * Meta Pixel's 17 standard events
 * (https://developers.facebook.com/docs/meta-pixel/reference). Offered for
 * every `action_source` other than `business_messaging`, alongside custom
 * event names (see `metaCapiActionSourcePolicy`).
 */
export const metaPixelStandardEventNames = [
  "AddPaymentInfo",
  "AddToCart",
  "AddToWishlist",
  "CompleteRegistration",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "InitiateCheckout",
  "Lead",
  "Purchase",
  "Schedule",
  "Search",
  "StartTrial",
  "SubmitApplication",
  "Subscribe",
  "ViewContent",
] as const

/**
 * Base validation rule for every CAPI `event_name` — standard or custom —
 * per Meta's Pixel custom-events rule: "must be strings, and cannot exceed
 * 50 characters in length"
 * (https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking).
 * No extra charset restriction is published, so none is enforced here.
 * Catalog membership (which names are valid for a given `action_source`) is
 * a separate refinement built on top of this base rule, not part of it.
 */
export const metaCapiEventNameSchema = z.string().trim().min(1).max(50)

/**
 * `eventName` is a plain string at the type level (DB column, integration
 * input, business input) — not a branded literal union — so every existing
 * caller supplying a bare string literal (e.g. `capiEventNameByEventType` in
 * the ads-conversion sender) keeps compiling. Catalog membership is enforced
 * at validation time via `metaCapiEventNameSchema` plus the per-action-source
 * catalog, not at the type level.
 */
export type MetaCapiEventName = string

/** One of the two documented event catalogs an `action_source` can offer. */
export type MetaCapiEventCatalog = "businessMessaging" | "pixel"

/** Default `eventName` to preselect for each event catalog. */
export const defaultEventNameByCatalog: Record<MetaCapiEventCatalog, string> = {
  businessMessaging: "LeadSubmitted",
  pixel: "Lead",
}

/** Standard event names, looked up by which catalog they belong to. */
export const eventNamesByCatalog: Record<
  MetaCapiEventCatalog,
  readonly string[]
> = {
  businessMessaging: metaCapiBusinessMessagingEventNames,
  pixel: metaPixelStandardEventNames,
}

/**
 * Meta's `action_source` values offered by ChatbotX
 * (https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event#action_source).
 * `website` and `app` are excluded: `event_source_url` and
 * `client_user_agent` are each "required for website events", and `app_data`
 * is "Required for app events" — none of which ChatbotX's messaging-driven
 * flow/trigger steps can supply.
 */
export const metaCapiActionSourceValues = [
  "business_messaging",
  "email",
  "phone_call",
  "chat",
  "physical_store",
  "system_generated",
  "other",
] as const
export const metaCapiActionSourceSchema = z.enum(metaCapiActionSourceValues)
export type MetaCapiActionSource = z.infer<typeof metaCapiActionSourceSchema>

/**
 * The `action_source` a new step/action starts with, and what a stored step
 * saved before the field existed is read as.
 */
export const defaultMetaCapiActionSource: MetaCapiActionSource =
  "business_messaging"

/**
 * Meta CAPI `custom_data.content_type` values
 * (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data).
 */
export const metaCapiContentTypeValues = ["product", "product_group"] as const
export const metaCapiContentTypeSchema = z.enum(metaCapiContentTypeValues)
export type MetaCapiContentType = z.infer<typeof metaCapiContentTypeSchema>

/**
 * Single shared policy object keyed by `action_source`, driving both the
 * builder UI's event-name catalog and the worker sender's identity
 * strategy — no second map, no inline `=== "business_messaging"` literal
 * outside this object. Only `business_messaging` uses the
 * messaging-channel identity (page-scoped id / phone number + `ctwa_clid`);
 * every other action source identifies the person via hashed customer
 * information only (`HashedCapiUserData`).
 */
export const metaCapiActionSourcePolicy = {
  business_messaging: {
    usesMessagingIdentity: true,
    eventCatalog: "businessMessaging",
    allowsCustomEventNames: false,
  },
  email: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
  phone_call: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
  chat: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
  physical_store: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
  system_generated: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
  other: {
    usesMessagingIdentity: false,
    eventCatalog: "pixel",
    allowsCustomEventNames: true,
  },
} satisfies Record<
  MetaCapiActionSource,
  {
    usesMessagingIdentity: boolean
    eventCatalog: MetaCapiEventCatalog
    allowsCustomEventNames: boolean
  }
>
