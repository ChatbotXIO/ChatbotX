import { humanizeGoogleEnum } from "./humanize-google-enum"

/**
 * Google returns enum names as open-ended strings, so only the values we know
 * are translated (exhaustive literal maps: a member without a key fails
 * type-checking). Anything else renders through `googleAds.enums.unknown`
 * with the humanized raw value.
 */
const categoryLabelKey = {
  DEFAULT: "googleAds.enums.category.default",
  PURCHASE: "googleAds.enums.category.purchase",
  ADD_TO_CART: "googleAds.enums.category.addToCart",
  BEGIN_CHECKOUT: "googleAds.enums.category.beginCheckout",
  SUBSCRIBE_PAID: "googleAds.enums.category.subscribePaid",
  PHONE_CALL_LEAD: "googleAds.enums.category.phoneCallLead",
  IMPORTED_LEAD: "googleAds.enums.category.importedLead",
  SUBMIT_LEAD_FORM: "googleAds.enums.category.submitLeadForm",
  BOOK_APPOINTMENT: "googleAds.enums.category.bookAppointment",
  SIGNUP: "googleAds.enums.category.signup",
  REQUEST_QUOTE: "googleAds.enums.category.requestQuote",
  GET_DIRECTIONS: "googleAds.enums.category.getDirections",
  OUTBOUND_CLICK: "googleAds.enums.category.outboundClick",
  CONTACT: "googleAds.enums.category.contact",
  ENGAGEMENT: "googleAds.enums.category.engagement",
  STORE_VISIT: "googleAds.enums.category.storeVisit",
  STORE_SALE: "googleAds.enums.category.storeSale",
  QUALIFIED_LEAD: "googleAds.enums.category.qualifiedLead",
  CONVERTED_LEAD: "googleAds.enums.category.convertedLead",
  PAGE_VIEW: "googleAds.enums.category.pageView",
  DOWNLOAD: "googleAds.enums.category.download",
  LEAD: "googleAds.enums.category.lead",
} as const

const countingTypeLabelKey = {
  ONE_PER_CLICK: "googleAds.enums.countingType.onePerClick",
  MANY_PER_CLICK: "googleAds.enums.countingType.manyPerClick",
} as const

const actionStatusLabelKey = {
  ENABLED: "googleAds.enums.actionStatus.enabled",
  REMOVED: "googleAds.enums.actionStatus.removed",
  HIDDEN: "googleAds.enums.actionStatus.hidden",
} as const

export const googleEnumLabelKeys = {
  category: categoryLabelKey,
  countingType: countingTypeLabelKey,
  actionStatus: actionStatusLabelKey,
} as const

export type GoogleEnumGroup = keyof typeof googleEnumLabelKeys

type EnumLabelKey = {
  [G in GoogleEnumGroup]: (typeof googleEnumLabelKeys)[G][keyof (typeof googleEnumLabelKeys)[G]]
}[GoogleEnumGroup]

type Translate = {
  (key: EnumLabelKey): string
  (key: "googleAds.enums.unknown", values: { value: string }): string
}

const knownKey = (
  group: GoogleEnumGroup,
  value: string,
): EnumLabelKey | null => {
  const map: Readonly<Record<string, EnumLabelKey>> = googleEnumLabelKeys[group]
  return Object.hasOwn(map, value) ? (map[value] ?? null) : null
}

/** Translated label for a known Google enum value, else a translated "Other (humanized value)". */
export const googleEnumLabel = (
  group: GoogleEnumGroup,
  value: string,
  t: Translate,
): string => {
  const key = knownKey(group, value)
  return key
    ? t(key)
    : t("googleAds.enums.unknown", { value: humanizeGoogleEnum(value) })
}
