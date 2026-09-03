import { requireEventNameAllowedForActionSource } from "@chatbotx.io/flow-config"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  eventNamesByCatalog,
  type MetaCapiActionSource,
  type MetaCapiEventCatalog,
  metaCapiActionSourcePolicy,
  metaCapiActionSourceSchema,
  type metaCapiBusinessMessagingEventNames,
  type metaPixelStandardEventNames,
} from "@chatbotx.io/utils/meta-capi"
import type { useTranslations } from "next-intl"
import { z } from "zod"
import { getMetaCapiEventLabel } from "./event-label"

type MetaCapiTranslator = ReturnType<typeof useTranslations>

/** UI-only sentinel for "Custom event…" — never stored as `eventName`. */
export const CUSTOM_EVENT_OPTION = "__custom__"

type EventGroupKey =
  | "commerce"
  | "leads"
  | "orders"
  | "feedback"
  | "leadsAndSignups"
  | "other"

const groupLabelKeys = {
  commerce: "metaConversions.fields.eventType.groups.commerce",
  leads: "metaConversions.fields.eventType.groups.leads",
  orders: "metaConversions.fields.eventType.groups.orders",
  feedback: "metaConversions.fields.eventType.groups.feedback",
  leadsAndSignups: "metaConversions.fields.eventType.groups.leadsAndSignups",
  other: "metaConversions.fields.eventType.groups.other",
} as const satisfies Record<EventGroupKey, string>

/**
 * Business-messaging events grouped the way Meta documents them
 * (https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging).
 */
const businessMessagingEventGroups: Record<
  (typeof metaCapiBusinessMessagingEventNames)[number],
  EventGroupKey
> = {
  Purchase: "commerce",
  InitiateCheckout: "commerce",
  AddToCart: "commerce",
  ViewContent: "commerce",
  CartAbandoned: "commerce",
  LeadSubmitted: "leads",
  QualifiedLead: "leads",
  OrderCreated: "orders",
  OrderShipped: "orders",
  OrderDelivered: "orders",
  OrderCanceled: "orders",
  OrderReturned: "orders",
  RatingProvided: "feedback",
  ReviewProvided: "feedback",
}

/**
 * Meta Pixel's 17 standard events grouped by intent
 * (https://developers.facebook.com/docs/meta-pixel/reference).
 */
const pixelEventGroups: Record<
  (typeof metaPixelStandardEventNames)[number],
  EventGroupKey
> = {
  AddPaymentInfo: "commerce",
  AddToCart: "commerce",
  AddToWishlist: "commerce",
  CustomizeProduct: "commerce",
  InitiateCheckout: "commerce",
  Purchase: "commerce",
  Search: "commerce",
  ViewContent: "commerce",
  CompleteRegistration: "leadsAndSignups",
  Contact: "leadsAndSignups",
  Lead: "leadsAndSignups",
  Schedule: "leadsAndSignups",
  StartTrial: "leadsAndSignups",
  SubmitApplication: "leadsAndSignups",
  Subscribe: "leadsAndSignups",
  Donate: "other",
  FindLocation: "other",
}

/** Ordered group keys per catalog — controls the order groups render in. */
const groupOrderByCatalog: Record<MetaCapiEventCatalog, EventGroupKey[]> = {
  businessMessaging: ["commerce", "leads", "orders", "feedback"],
  pixel: ["commerce", "leadsAndSignups", "other"],
}

const eventGroupsByCatalog: Record<
  MetaCapiEventCatalog,
  Record<string, EventGroupKey>
> = {
  businessMessaging: businessMessagingEventGroups,
  pixel: pixelEventGroups,
}

/**
 * Builds the `ComboboxField` option groups for an `action_source`'s event
 * catalog: one `CommandGroup` per group key, in catalog order, plus a
 * trailing "Custom event…" sentinel entry when the catalog allows custom
 * names.
 */
export const buildEventOptions = (
  actionSource: MetaCapiActionSource,
  t: MetaCapiTranslator,
): SelectOption[] => {
  const policy = metaCapiActionSourcePolicy[actionSource]
  const groupsForCatalog = eventGroupsByCatalog[policy.eventCatalog]
  const namesForCatalog = eventNamesByCatalog[policy.eventCatalog]

  const options: SelectOption[] = groupOrderByCatalog[policy.eventCatalog].map(
    (groupKey) => ({
      value: groupKey,
      label: t(groupLabelKeys[groupKey]),
      children: namesForCatalog
        .filter((name) => groupsForCatalog[name] === groupKey)
        .map((name) => ({
          value: name,
          label: getMetaCapiEventLabel(name, t),
        })),
    }),
  )

  if (!policy.allowsCustomEventNames) {
    return options
  }

  return [
    ...options,
    {
      value: CUSTOM_EVENT_OPTION,
      label: t("metaConversions.fields.eventType.custom"),
    },
  ]
}

/**
 * Reuses the same `requireEventNameAllowedForActionSource` refinement the
 * dialog's resolver and the trigger/flow-step schemas apply — no second
 * copy of the catalog/reservation rules for the UI to drift from.
 */
const eventNameAllowedForActionSourceSchema = z
  .object({
    eventName: z.string(),
    actionSource: metaCapiActionSourceSchema,
  })
  .superRefine(requireEventNameAllowedForActionSource)

/** Authoritative "is this event name valid for this action source" check. */
export const isEventNameAllowedForActionSource = (
  eventName: string,
  actionSource: MetaCapiActionSource,
): boolean =>
  eventNameAllowedForActionSourceSchema.safeParse({ eventName, actionSource })
    .success
