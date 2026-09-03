import type {
  MetaCapiActionSource,
  MetaCapiContentType,
  metaCapiBusinessMessagingEventNames,
  metaPixelStandardEventNames,
} from "@chatbotx.io/utils/meta-capi"
import type { useTranslations } from "next-intl"

type MetaCapiTranslator = ReturnType<typeof useTranslations>

/** Meta's official `action_source` docs, linked from the action-source field. */
export const META_CAPI_ACTION_SOURCE_DOCS_URL =
  "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event#action_source"

type KnownMetaCapiEventName =
  | (typeof metaCapiBusinessMessagingEventNames)[number]
  | (typeof metaPixelStandardEventNames)[number]

/**
 * One `Record<KnownEventName, translationKey>` covering the union of both
 * event catalogs (27 distinct names). Every standard event Meta documents —
 * business-messaging or Pixel — resolves to a translated label; anything
 * else falls through to the raw (already-validated) custom name in
 * `getMetaCapiEventLabel`.
 */
const eventNameLabelKeys = {
  Purchase: "metaConversions.fields.eventType.purchase",
  LeadSubmitted: "metaConversions.fields.eventType.leadSubmitted",
  InitiateCheckout: "metaConversions.fields.eventType.initiateCheckout",
  AddToCart: "metaConversions.fields.eventType.addToCart",
  ViewContent: "metaConversions.fields.eventType.viewContent",
  OrderCreated: "metaConversions.fields.eventType.orderCreated",
  OrderShipped: "metaConversions.fields.eventType.orderShipped",
  OrderDelivered: "metaConversions.fields.eventType.orderDelivered",
  OrderCanceled: "metaConversions.fields.eventType.orderCanceled",
  OrderReturned: "metaConversions.fields.eventType.orderReturned",
  CartAbandoned: "metaConversions.fields.eventType.cartAbandoned",
  QualifiedLead: "metaConversions.fields.eventType.qualifiedLead",
  RatingProvided: "metaConversions.fields.eventType.ratingProvided",
  ReviewProvided: "metaConversions.fields.eventType.reviewProvided",
  AddPaymentInfo: "metaConversions.fields.eventType.addPaymentInfo",
  AddToWishlist: "metaConversions.fields.eventType.addToWishlist",
  CompleteRegistration: "metaConversions.fields.eventType.completeRegistration",
  Contact: "metaConversions.fields.eventType.contact",
  CustomizeProduct: "metaConversions.fields.eventType.customizeProduct",
  Donate: "metaConversions.fields.eventType.donate",
  FindLocation: "metaConversions.fields.eventType.findLocation",
  Lead: "metaConversions.fields.eventType.lead",
  Schedule: "metaConversions.fields.eventType.schedule",
  Search: "metaConversions.fields.eventType.search",
  StartTrial: "metaConversions.fields.eventType.startTrial",
  SubmitApplication: "metaConversions.fields.eventType.submitApplication",
  Subscribe: "metaConversions.fields.eventType.subscribe",
} as const satisfies Record<KnownMetaCapiEventName, string>

type EventLabelKey = (typeof eventNameLabelKeys)[KnownMetaCapiEventName]

/**
 * Standard event name → translated label; a custom event name (not a key of
 * `eventNameLabelKeys`) is returned verbatim, already validated by
 * `metaCapiEventNameSchema` upstream. Used by the fields component, the
 * dialog's trigger-card summary, and the flow-step viewer, so the label
 * logic lives in exactly one place.
 */
export const getMetaCapiEventLabel = (
  eventName: string,
  t: MetaCapiTranslator,
): string => {
  const key = (eventNameLabelKeys as Record<string, EventLabelKey | undefined>)[
    eventName
  ]
  return key ? t(key) : eventName
}

const actionSourceLabelKeys = {
  business_messaging: "metaConversions.actionSource.business_messaging",
  email: "metaConversions.actionSource.email",
  phone_call: "metaConversions.actionSource.phone_call",
  chat: "metaConversions.actionSource.chat",
  physical_store: "metaConversions.actionSource.physical_store",
  system_generated: "metaConversions.actionSource.system_generated",
  other: "metaConversions.actionSource.other",
} as const satisfies Record<MetaCapiActionSource, string>

export const getMetaCapiActionSourceLabel = (
  actionSource: MetaCapiActionSource,
  t: MetaCapiTranslator,
): string => t(actionSourceLabelKeys[actionSource])

const contentTypeLabelKeys = {
  product: "metaConversions.fields.contentType.product",
  product_group: "metaConversions.fields.contentType.product_group",
} as const satisfies Record<MetaCapiContentType, string>

export const getMetaCapiContentTypeLabel = (
  contentType: MetaCapiContentType,
  t: MetaCapiTranslator,
): string => t(contentTypeLabelKeys[contentType])
