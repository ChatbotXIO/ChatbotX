import {
  type AdsEligibleChannel,
  isAdsEligibleChannel,
} from "@chatbotx.io/business/ads-conversion/channel-fields"

// Minimal structural shape this helper needs — deliberately NOT the full
// `ConversationContactInboxResource`, so extending `adReferral` with more
// fields (e.g. `sourceUrl`) never has to touch the badge logic or its tests.
type AdBadgeInput = {
  channel: string
  adReferral: { adTitle: string | null } | null
}

// i18n key per ad channel — WhatsApp CTWA (Click-To-WhatsApp), Messenger CTM
// (Click-To-Messenger), Instagram CTID (Click-To-Instagram-Direct). `satisfies
// Record<AdsEligibleChannel, ...>` makes this exhaustive: adding a channel to
// `adsEligibleChannelTypes` fails to compile here until its CT* label key is
// declared, so a new channel can never silently fall back to generic "Ads".
const AD_BADGE_LABEL_KEY_BY_CHANNEL = {
  whatsapp: "fields.adReferral.ctwa",
  messenger: "fields.adReferral.ctm",
  instagram: "fields.adReferral.ctid",
} satisfies Record<AdsEligibleChannel, string>

const GENERIC_AD_BADGE_LABEL_KEY = "fields.adReferral.label"

/**
 * Resolves the translation key for an ad badge's channel-specific label.
 * `ContactInbox.channel` is unconstrained text; a value that is not an
 * ads-eligible channel falls back to the generic "Ads" label. Reuses the
 * business-layer `isAdsEligibleChannel` guard so the eligible set stays
 * single-sourced.
 */
export function adBadgeLabelKey(channel: string): string {
  return isAdsEligibleChannel(channel)
    ? AD_BADGE_LABEL_KEY_BY_CHANNEL[channel]
    : GENERIC_AD_BADGE_LABEL_KEY
}

export type AdBadge = {
  /**
   * Channel of the ad-attributed inbox that drives the badge label
   * (whatsapp → CTWA, messenger → CTM, instagram → CTID). `ContactInbox.
   * channel` is unconstrained text, so consumers must handle an unknown value.
   */
  channel: string
  /** First non-empty ad title across the ad inboxes, for the tooltip. */
  adTitle: string | null
}

/**
 * Selects the single inbox "Ads" badge for a conversation from its
 * contactInboxes. A conversation can hold several channel inboxes, so:
 *
 *  - the badge is shown if ANY inbox came from a Meta ad (`adReferral != null`);
 *  - `channel` is taken from the FIRST ad-attributed inbox — it drives the
 *    channel-specific label (CTWA/CTM/CTID);
 *  - `adTitle` is the FIRST NON-EMPTY title across all ad inboxes, chosen
 *    INDEPENDENTLY of which inbox triggered visibility — so an ad inbox whose
 *    `adTitle` is null does not suppress a later ad inbox's real title.
 *
 * Returns `null` when no inbox is ad-attributed (badge hidden).
 */
export function selectAdBadge(
  contactInboxes: readonly AdBadgeInput[] | null | undefined,
): AdBadge | null {
  const adInboxes = (contactInboxes ?? []).filter(
    (contactInbox) => contactInbox.adReferral != null,
  )

  if (adInboxes.length === 0) {
    return null
  }

  return {
    channel: adInboxes[0].channel,
    adTitle:
      adInboxes.find((contactInbox) => contactInbox.adReferral?.adTitle)
        ?.adReferral?.adTitle ?? null,
  }
}
