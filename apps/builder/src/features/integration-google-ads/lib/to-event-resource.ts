import {
  type GoogleAdsEventOptions,
  type GoogleAdsEventStatus,
  googleAdsEventOptionsSchema,
} from "@chatbotx.io/database/partials"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import type { GoogleAdsEventResource } from "../schema/events"
import { maskClickId } from "./mask-click-id"

const REDACTED = "[redacted]"

type ConsentSnapshot = NonNullable<GoogleAdsEventResource["consentSnapshot"]>

/** Whether the snapshot's consent reached Google, by status alone. */
const deliveryByStatus = {
  pending: "toSend",
  sending: "toSend",
  sent: "sent",
  processed: "sent",
  skipped_no_account: "notSent",
  skipped_expired: "notSent",
} as const satisfies Partial<
  Record<GoogleAdsEventStatus, ConsentSnapshot["delivery"]>
>

/**
 * The stored error is already sanitized; this also strips the row's own click
 * id, transaction id and request id as a last guard. Longest first, so a value
 * that contains another is removed whole instead of leaving a fragment.
 */
const redactIdentifiers = (
  error: string | null,
  identifiers: readonly (string | null)[],
): string | null => {
  if (!error) {
    return null
  }
  return identifiers
    .filter((identifier): identifier is string => Boolean(identifier))
    .sort((a, b) => b.length - a.length)
    .reduce((text, identifier) => text.replaceAll(identifier, REDACTED), error)
}

/**
 * A failed event reached Google only when it failed after the upload
 * (processing / timeout); a delivery-stage failure may or may not have.
 */
const toDelivery = (
  row: GoogleAdsConversionEventModel,
): ConsentSnapshot["delivery"] => {
  if (row.status !== "failed") {
    return deliveryByStatus[row.status]
  }
  return row.failureStage === "processing" || row.failureStage === "timeout"
    ? "sent"
    : "unknown"
}

const toConsentStatus = (
  entry: GoogleAdsEventOptions["consent"]["adUserData"],
): ConsentSnapshot["adUserData"] => entry.status ?? "notProvided"

const toConsentSnapshot = (
  row: GoogleAdsConversionEventModel,
  options: GoogleAdsEventOptions,
): ConsentSnapshot => ({
  delivery: toDelivery(row),
  adUserData: toConsentStatus(options.consent.adUserData),
  // The legacy upload API has no ad personalization field.
  adPersonalization:
    row.uploadMethod === "legacy"
      ? "notSupported"
      : toConsentStatus(options.consent.adPersonalization),
})

type CustomerMatching = GoogleAdsEventResource["customerMatching"]

const toCustomerMatching = (
  options: GoogleAdsEventOptions | null,
): CustomerMatching => {
  const matching = options?.version === 2 ? options.matching : undefined
  if (!matching) {
    return null
  }
  return {
    status: matching.status,
    fields: [
      ...(matching.email ? (["email"] as const) : []),
      ...(matching.phone ? (["phone"] as const) : []),
    ],
  }
}

type CustomerProperties = GoogleAdsEventResource["customerProperties"]

const toCustomerProperties = (
  options: GoogleAdsEventOptions | null,
): CustomerProperties =>
  (options?.version === 2 ? options.customerProperties : undefined) ?? null

export const toGoogleAdsEventResource = (
  row: GoogleAdsConversionEventModel,
): GoogleAdsEventResource => {
  // An unreadable snapshot (unknown version, malformed) is treated like none.
  const parsed = googleAdsEventOptionsSchema.safeParse(row.options)
  const options = parsed.success ? parsed.data : null
  return {
    id: row.id,
    status: row.status,
    failureStage: row.failureStage,
    processingStatus: row.processingStatus,
    error: redactIdentifiers(row.error, [
      row.clickId,
      row.transactionId,
      row.requestId,
    ]),
    channel: row.channel,
    conversionActionId: row.conversionActionId,
    conversionActionName: row.conversionActionName,
    uploadMethod: row.uploadMethod,
    clickIdType: row.clickIdType,
    maskedClickId: maskClickId(row.clickId),
    occurredAt: row.occurredAt,
    sentAt: row.sentAt,
    value: row.value,
    currency: row.currency,
    identity: options
      ? {
          mode: options.identity.effectivePolicy,
          id: options.identity.id,
        }
      : null,
    conversionTimeProvided: options?.timeSource === "provided",
    customerMatching: toCustomerMatching(options),
    customerProperties: toCustomerProperties(options),
    consentSnapshot: options ? toConsentSnapshot(row, options) : null,
  }
}
