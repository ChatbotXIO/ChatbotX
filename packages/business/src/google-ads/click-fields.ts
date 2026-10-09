import type { GoogleAdsChannel } from "@chatbotx.io/utils/google-click"

// Client-safe on purpose (types and pure functions only): "use client" builder
// code imports this subpath, and the business barrel pulls in the DB client.

type GoogleClickReferralFields = {
  gclid?: string | null
  gbraid?: string | null
  googleClickReceivedAt?: string | null
}

export type GoogleAdsClickSummary = {
  clickIdType: "gclid" | "gbraid"
  receivedAt: string | null
}

/** What the UI may know about a click — never the click id itself. */
export const resolveGoogleAdsClick = (
  referral: GoogleClickReferralFields | null | undefined,
): GoogleAdsClickSummary | null => {
  if (!(referral?.gclid || referral?.gbraid)) {
    return null
  }
  return {
    clickIdType: referral.gclid ? "gclid" : "gbraid",
    receivedAt: referral.googleClickReceivedAt ?? null,
  }
}

export type GoogleAdsBadgeInbox = {
  channel: string
  googleAdsClick: GoogleAdsClickSummary | null
}

export type GoogleAdsBadge = {
  channel: GoogleAdsChannel | string
  clickIdType: GoogleAdsClickSummary["clickIdType"]
}

/** One badge per conversation: the first inbox that carries a Google click. */
export const selectGoogleAdsBadge = (
  contactInboxes: readonly GoogleAdsBadgeInbox[] | null | undefined,
): GoogleAdsBadge | null => {
  const clicked = (contactInboxes ?? []).find(
    ({ googleAdsClick }) => googleAdsClick !== null,
  )
  return clicked?.googleAdsClick
    ? {
        channel: clicked.channel,
        clickIdType: clicked.googleAdsClick.clickIdType,
      }
    : null
}
