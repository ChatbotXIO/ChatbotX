import { isPositiveBigint } from "@chatbotx.io/database/partials"
import type { ContactReferralEventCreateValues } from "@chatbotx.io/database/repositories"
import type { ContactInboxReferral } from "@chatbotx.io/database/schema"
import { readGoogleClick } from "@chatbotx.io/utils/google-click"
import { resolveAdReferral } from "../ads-conversion/channel-fields"
import type { ContactActivityEntry } from "../contact-activity/service"

/** When and through which event a referral reached us. */
export type ReferralOccurrence = {
  occurredAt: Date
  /**
   * Stable id of the carrying event (inbound message id, webhook timestamp).
   * Makes a Meta touch without a click id idempotent under a webhook retry;
   * without one such a touch cannot be keyed, so it is not recorded.
   */
  eventKey?: string
}

/** The columns an ad touch decides; identity columns come from the caller. */
export type AdTouchValues = Pick<
  ContactReferralEventCreateValues,
  | "adId"
  | "adGroupId"
  | "campaignId"
  | "clickId"
  | "clickIdType"
  | "dedupKey"
  | "metadata"
  | "occurredAt"
  | "provider"
  | "ref"
  | "source"
  | "sourceUrl"
>

type AdTouchBuilder = (
  referral: ContactInboxReferral,
  occurrence: ReferralOccurrence,
) => AdTouchValues | null

// Meta: CTWA carries a click id; CTM/CTID carry only `adId` + `source: "ADS"`,
// so the carrying event is part of the key — `adId` alone would collapse
// repeat clicks of the same ad.
const buildMetaAdTouch: AdTouchBuilder = (referral, occurrence) => {
  if (!resolveAdReferral(referral)) {
    return null
  }

  const ctwaClid = referral.ctwaClid || null
  if (!(ctwaClid || occurrence.eventKey)) {
    return null
  }

  return {
    provider: "meta",
    occurredAt: occurrence.occurredAt,
    adId: referral.adId ?? null,
    clickIdType: ctwaClid ? "ctwa" : null,
    clickId: ctwaClid,
    ref: referral.ref ?? null,
    source: referral.source ?? null,
    sourceUrl: referral.sourceUrl ?? null,
    metadata: {
      adTitle: referral.adTitle ?? null,
      adBody: referral.adBody ?? null,
      sourcePlatform: referral.sourcePlatform ?? null,
    },
    dedupKey: ctwaClid
      ? `ctwa:${ctwaClid}`
      : `ad:${referral.adId}:${occurrence.eventKey}`,
  }
}

// Google: `googleClickReceivedAt` is when the carrying message arrived, which
// is also what the click id is deduplicated on. A Zalo profile lookup returns
// the same click on every read, so the click id alone is the key. The ad ids
// are optional (Zalo carries none).
const buildGoogleAdTouch: AdTouchBuilder = (referral, occurrence) => {
  const click = readGoogleClick(referral)
  if (!click) {
    return null
  }

  return {
    provider: "google",
    occurredAt: referral.googleClickReceivedAt
      ? new Date(referral.googleClickReceivedAt)
      : occurrence.occurredAt,
    adId: referral.googleAdId ?? null,
    campaignId: referral.googleCampaignId ?? null,
    adGroupId: referral.googleAdGroupId ?? null,
    clickIdType: click.clickIdType,
    clickId: click.clickId,
    dedupKey: `${click.clickIdType}:${click.clickId}`,
  }
}

const AD_TOUCH_BUILDERS: readonly AdTouchBuilder[] = [
  buildMetaAdTouch,
  buildGoogleAdTouch,
]

/**
 * Every ad touch a referral carries — one per provider, so a message that
 * carries both a Meta ad and a Google click records both. Empty for an organic
 * referral (ref link, ig.me shortlink).
 */
export const toAdTouches = (
  referral: ContactInboxReferral | null | undefined,
  occurrence: ReferralOccurrence,
): AdTouchValues[] => {
  if (!referral) {
    return []
  }

  return AD_TOUCH_BUILDERS.flatMap((build) => {
    const touch = build(referral, occurrence)
    return touch ? [touch] : []
  })
}

/**
 * The "Clicked ad" activity of each touch that names an ad. A touch without an
 * ad id (a Zalo Google click), or with a non-numeric one, has no filterable
 * reference and is recorded in the event log only.
 */
export const toAdClickActivityEntries = (
  touches: readonly AdTouchValues[],
  contactId: string,
): ContactActivityEntry[] =>
  touches.flatMap(({ adId, occurredAt }) =>
    adId && isPositiveBigint(adId)
      ? [
          {
            activityType: "adClicked" as const,
            contactId,
            occurredAt,
            referenceId: adId,
            referenceType: "ad" as const,
          },
        ]
      : [],
  )
