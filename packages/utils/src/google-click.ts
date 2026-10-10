import { z } from "zod"

/**
 * Google Ads Click-to-Message click identifiers.
 *
 * WhatsApp carries them as invisible Variation Selector Supplement characters
 * inside the starter message; Messenger carries them as a structured `ref`
 * (`gclid:<id>,k1:v1`). Pure module — no I/O, safe for any package.
 */

/**
 * The ONE list of channels that can carry a Google click. Adding a channel is
 * this value + that channel's capture wiring: call `consumeGoogleClickRef` /
 * `extractInvisibleGoogleClick` in its incoming-message handler and return the
 * result as the message `referral` (with the ref consumed). Everything else
 * (DB column, API filter, labels, gates, persistence, badge, filter) derives
 * from here.
 */
export const GOOGLE_ADS_CHANNEL_VALUES = ["whatsapp", "messenger"] as const
export const googleAdsChannels = z.enum(GOOGLE_ADS_CHANNEL_VALUES)
export type GoogleAdsChannel = z.infer<typeof googleAdsChannels>

/** `ContactInbox.referral` keys written for a Google click. */
export const GOOGLE_CLICK_REFERRAL_KEYS = [
  "gclid",
  "gbraid",
  "googleCampaignId",
  "googleAdGroupId",
  "googleAdId",
  "googleClickReceivedAt",
] as const
export type GoogleClickReferralKey = (typeof GOOGLE_CLICK_REFERRAL_KEYS)[number]
export type GoogleClickReferral = Record<GoogleClickReferralKey, string | null>

/** Character set Google maps onto `U+E0100 + index` (62 alphanumerics + 8 specials). */
export const GOOGLE_INVISIBLE_CHAR_SET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_{}'\",:-"
export const GOOGLE_INVISIBLE_BASE_CODE_POINT = 0xe_01_00
export const GOOGLE_INVISIBLE_END_CODE_POINT =
  GOOGLE_INVISIBLE_BASE_CODE_POINT + GOOGLE_INVISIBLE_CHAR_SET.length

/** A maximal run of the invisible alphabet code points. */
export const INVISIBLE_RUN_PATTERN = new RegExp(
  `[${String.fromCodePoint(GOOGLE_INVISIBLE_BASE_CODE_POINT)}-${String.fromCodePoint(GOOGLE_INVISIBLE_END_CODE_POINT - 1)}]+`,
  "gu",
)

export const CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{10,512}$/

export type GoogleClickIdType = "gclid" | "gbraid"

export type GoogleClickPayload = {
  clickIdType: GoogleClickIdType
  clickId: string
  campaignId?: string
  adGroupId?: string
  adId?: string
}

export type ConsumedRun = { start: number; end: number }

export type DecodedGoogleClick = {
  payload: GoogleClickPayload | null
  /** The runs the payload was decoded from, in text order; empty when none. */
  consumed: ConsumedRun[]
}

const NOT_DECODED: DecodedGoogleClick = { payload: null, consumed: [] }

const decodeRunToText = (run: string): string => {
  let text = ""
  for (const char of run) {
    const index = (char.codePointAt(0) ?? 0) - GOOGLE_INVISIBLE_BASE_CODE_POINT
    text += GOOGLE_INVISIBLE_CHAR_SET.charAt(index)
  }
  return text
}

const NUMERIC_ID_PATTERN = /^\d{1,20}$/

/** Ad identifiers are numeric in Google's payload; anything else is dropped. */
const optionalId = (value: unknown): string | undefined => {
  const id =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value
  return typeof id === "string" && NUMERIC_ID_PATTERN.test(id) ? id : undefined
}

const clickIdTypes = ["gclid", "gbraid"] as const

/**
 * Google's own documents disagree on the key spelling: the decoder code reads
 * `campaignid` / `adgroupid` / `adid`, while the test URL in the same document
 * encodes `campaignId` / `adGroupId` / `creativeId`. Keys are therefore matched
 * case-insensitively and `creativeid` is accepted for the ad id.
 */
const lowercaseKeys = (
  fields: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]),
  )

const buildPayload = (
  rawFields: Record<string, unknown>,
): GoogleClickPayload | null => {
  const fields = lowercaseKeys(rawFields)
  for (const clickIdType of clickIdTypes) {
    const clickId = fields[clickIdType]
    if (typeof clickId === "string" && CLICK_ID_PATTERN.test(clickId)) {
      return {
        clickIdType,
        clickId,
        campaignId: optionalId(fields.campaignid),
        adGroupId: optionalId(fields.adgroupid),
        adId: optionalId(fields.adid) ?? optionalId(fields.creativeid),
      }
    }
  }
  return null
}

const parseJsonObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const decodeRuns = (
  runs: RegExpExecArray[],
): { payload: GoogleClickPayload; consumed: ConsumedRun[] } | null => {
  const fields = parseJsonObject(
    decodeRunToText(runs.map(([run]) => run).join("")),
  )
  const payload = fields ? buildPayload(fields) : null
  if (!payload) {
    return null
  }
  return {
    payload,
    consumed: runs.map((run) => ({
      start: run.index,
      end: run.index + run[0].length,
    })),
  }
}

/**
 * Decodes the click id hidden in a WhatsApp starter message. Google's reference
 * decoder joins every invisible character of the whole message (the payload may
 * sit at the start or be spread inside the text), so that is tried first; when
 * the join is not a valid payload (an unrelated invisible character got in) each
 * run is tried alone, longest first. Text without invisible characters costs
 * one regex scan and nothing else.
 */
export const decodeInvisibleGoogleClick = (
  text: string,
): DecodedGoogleClick => {
  const runs = [...text.matchAll(INVISIBLE_RUN_PATTERN)]
  if (runs.length === 0) {
    return NOT_DECODED
  }
  const candidates =
    runs.length > 1
      ? [
          runs,
          ...[...runs]
            .sort((a, b) => b[0].length - a[0].length)
            .map((run) => [run]),
        ]
      : [runs]
  for (const candidate of candidates) {
    const decoded = decodeRuns(candidate)
    if (decoded) {
      return decoded
    }
  }
  return NOT_DECODED
}

/**
 * Removes only the runs that decoded to a payload — never any other invisible
 * character (e.g. ideographic variation selectors in Japanese text).
 */
export const stripConsumedRuns = (
  text: string,
  consumed: ConsumedRun[],
): string =>
  [...consumed]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (kept, { start, end }) => `${kept.slice(0, start)}${kept.slice(end)}`,
      text,
    )

const safeDecodeUriComponent = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Parses Messenger's structured `ref`: `gclid:<id>,campaignid:1,…` or `gbraid:<id>,…`. */
export const parseGoogleClickRef = (ref: string): GoogleClickPayload | null => {
  const fields: Record<string, string> = {}
  for (const pair of safeDecodeUriComponent(ref).split(",")) {
    const separator = pair.indexOf(":")
    if (separator > 0) {
      const key = pair.slice(0, separator).trim().toLowerCase()
      fields[key] ??= pair.slice(separator + 1).trim()
    }
  }
  return buildPayload(fields)
}

/** All six referral keys; the click-id key not in `payload` is `null` so a newer click clears the other id. */
export const toGoogleClickReferral = (
  payload: GoogleClickPayload,
  receivedAt: Date,
): GoogleClickReferral => ({
  gclid: payload.clickIdType === "gclid" ? payload.clickId : null,
  gbraid: payload.clickIdType === "gbraid" ? payload.clickId : null,
  googleCampaignId: payload.campaignId ?? null,
  googleAdGroupId: payload.adGroupId ?? null,
  googleAdId: payload.adId ?? null,
  // A provider timestamp out of the Date range is an Invalid Date, whose
  // `toISOString()` throws; the click is still worth keeping, stamped now.
  googleClickReceivedAt: (Number.isNaN(receivedAt.getTime())
    ? new Date()
    : receivedAt
  ).toISOString(),
})

export type GoogleClickCapture = {
  /** The ref to keep routing on: `null` only when a Google click consumed it. */
  ref: string | null
  googleReferral: GoogleClickReferral | null
}

/** One-call capture for structured-ref channels (Messenger, Telegram start param, …). */
export const consumeGoogleClickRef = (
  ref: string | null | undefined,
  receivedAt: Date,
): GoogleClickCapture => {
  const payload = ref ? parseGoogleClickRef(ref) : null
  return payload
    ? { ref: null, googleReferral: toGoogleClickReferral(payload, receivedAt) }
    : { ref: ref ?? null, googleReferral: null }
}

/** One-call capture for invisible-character channels (WhatsApp starter text). */
export const extractInvisibleGoogleClick = (
  text: string,
  receivedAt: Date,
): { text: string; googleReferral: GoogleClickReferral | null } => {
  const { payload, consumed } = decodeInvisibleGoogleClick(text)
  return payload
    ? {
        text: stripConsumedRuns(text, consumed),
        googleReferral: toGoogleClickReferral(payload, receivedAt),
      }
    : { text, googleReferral: null }
}

type GoogleClickCarrier = { gclid?: string | null; gbraid?: string | null }

export const hasGoogleClick = (
  referral: GoogleClickCarrier | null | undefined,
): boolean => Boolean(referral?.gclid || referral?.gbraid)

/** Counting guidance: leads count "One" per click, purchases "Every". */
const LEAD_LIKE_CATEGORIES: ReadonlySet<string> = new Set([
  "QUALIFIED_LEAD",
  "CONVERTED_LEAD",
  "SUBMIT_LEAD_FORM",
  "CONTACT",
  "SIGNUP",
  "BOOK_APPOINTMENT",
  "REQUEST_QUOTE",
  "IMPORTED_LEAD",
])

export const isLeadLikeCategory = (category: string): boolean =>
  LEAD_LIKE_CATEGORIES.has(category)

const TEN_DIGIT_CUSTOMER_ID = /^\d{10}$/

/** `1234567890` → `123-456-7890`; any other shape is returned unchanged. */
export const formatCustomerId = (customerId: string): string =>
  TEN_DIGIT_CUSTOMER_ID.test(customerId)
    ? `${customerId.slice(0, 3)}-${customerId.slice(3, 6)}-${customerId.slice(6)}`
    : customerId

export const customerIdSchema = z
  .string()
  .transform((value) => value.replace(/[-\s]/g, ""))
  .pipe(z.string().regex(TEN_DIGIT_CUSTOMER_ID))

/**
 * Data Manager `UserProperties`: advertiser-assessed facts about the customer
 * at the time of the event. The plan ships NEW / RETURNING (Google also has
 * REENGAGED) and the three value buckets.
 */
export const googleAdsCustomerTypes = z.enum(["NEW", "RETURNING"])
export const googleAdsCustomerValueBuckets = z.enum(["LOW", "MEDIUM", "HIGH"])

/**
 * A customer-matching source: ONE `{{variable}}` and nothing else, at most 200
 * characters in all (the recorded snapshot enforces the same limit). Shared by
 * the flow schema (what an admin may save) and by `record()` (what a saved flow
 * may be recorded with), so a stale literal such as `off` or a number can never
 * be taken for a variable and resolved or hashed as if it were one.
 */
const MATCH_TEMPLATE_PATTERN = /^\{\{[^{}]{1,196}\}\}$/

export const isGoogleAdsMatchTemplate = (value: string): boolean =>
  MATCH_TEMPLATE_PATTERN.test(value)

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/

const MS_PER_MINUTE = 60_000

/** UTC instant of a validated RFC 3339 string, or `null` when it is not one. */
const parseRfc3339 = (value: string): Date | null => {
  const match = RFC3339_PATTERN.exec(value)
  if (!match) {
    return null
  }
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number) as [number, number, number, number, number, number]
  if (hour > 23 || minute > 59 || second > 59) {
    return null
  }
  const offsetHour = Number(match[8] ?? 0)
  const offsetMinute = Number(match[9] ?? 0)
  if (offsetHour > 23 || offsetMinute > 59) {
    return null
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const calendar = new Date(wall)
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null
  }
  const offsetMinutes = offsetHour * 60 + offsetMinute
  const signedOffset = match[7] === "-" ? -offsetMinutes : offsetMinutes
  return new Date(wall - signedOffset * MS_PER_MINUTE)
}

/** True when `value` has the RFC 3339 date-time shape with a zone (not yet calendar-checked). */
export const hasRfc3339Shape = (value: string): boolean =>
  RFC3339_PATTERN.test(value)

/**
 * True for a real calendar date-time with an explicit zone (`Z` or `±hh:mm`),
 * RFC 3339 style. A value without a zone is rejected: the instant would be
 * ambiguous.
 */
export const isRfc3339WithZone = (value: string): boolean =>
  parseRfc3339(value) !== null

/**
 * The instant a conversion-time string denotes, as a UTC `Date` in whole
 * seconds (fractional seconds are dropped), or `null` when `value` is not an
 * RFC 3339 date-time with a zone.
 */
export const parseConversionTime = (value: string): Date | null =>
  parseRfc3339(value)

/**
 * Stable, machine-readable reasons a Google Ads conversion was refused. Used
 * as the flow step's `errorMessage` and as the first line of the Error Log
 * detail, which the builder translates. Shared so both sides stay exhaustive.
 */
export const googleAdsConversionErrorCodes = {
  unsupportedChannel: "google_ads_unsupported_channel",
  noClick: "google_ads_no_click",
  noAccount: "google_ads_no_account",
  unknownConversionAction: "google_ads_unknown_conversion_action",
  actionDisabled: "google_ads_action_disabled",
  incompatibleAction: "google_ads_incompatible_action",
  unsupportedAction: "google_ads_unsupported_action",
  invalidValue: "google_ads_invalid_value",
  invalidInput: "google_ads_invalid_input",
  recordFailed: "google_ads_record_failed",
  invalidConsentConfig: "google_ads_invalid_consent_config",
  invalidConsentValue: "google_ads_invalid_consent_value",
  invalidConversionTime: "google_ads_invalid_conversion_time",
  missingDedupId: "google_ads_missing_dedup_id",
  invalidDedupId: "google_ads_invalid_dedup_id",
  missingOccurrenceKey: "google_ads_missing_occurrence_key",
  invalidCustomerProperty: "google_ads_invalid_customer_property",
} as const

export type GoogleAdsConversionErrorCode =
  (typeof googleAdsConversionErrorCodes)[keyof typeof googleAdsConversionErrorCodes]

type GoogleAdsActionFlags = {
  status: string
  countingType: string
  attributionModel?: string | null
}

/** The one definition of which conversion actions can receive conversions (business and UI share it). */
const ENABLED_ACTION_STATUS = "ENABLED"
const EXTERNAL_ATTRIBUTION_MODEL = "EXTERNAL"
const ONE_PER_CLICK_COUNTING_TYPE = "ONE_PER_CLICK"

export const isEnabledConversionAction = (
  action: Pick<GoogleAdsActionFlags, "status">,
): boolean => action.status === ENABLED_ACTION_STATUS

/** Data Manager cannot ingest conversions attributed by a third party. */
export const isExternalAttributionAction = (
  action: Pick<GoogleAdsActionFlags, "attributionModel">,
): boolean => action.attributionModel === EXTERNAL_ATTRIBUTION_MODEL

/** A gbraid (iOS) click cannot be sent to a ONE_PER_CLICK action. */
export const isOnePerClickAction = (
  action: Pick<GoogleAdsActionFlags, "countingType">,
): boolean => action.countingType === ONE_PER_CLICK_COUNTING_TYPE

/** Can receive conversions: enabled and not externally attributed. */
export const isSendableConversionAction = (
  action: Pick<GoogleAdsActionFlags, "status" | "attributionModel">,
): boolean =>
  isEnabledConversionAction(action) && !isExternalAttributionAction(action)
