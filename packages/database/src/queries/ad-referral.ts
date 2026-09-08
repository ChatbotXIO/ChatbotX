import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import { PAID_AD_REFERRAL_SOURCE } from "@chatbotx.io/utils/referral"
import { type SQL, sql } from "drizzle-orm"
import { contactInboxModel } from "../schema"

// LEAF module by design: it imports only the schema and the shared source
// constants, never a repository or another query module. Both
// `repositories/contact-inbox` and `repositories/ads-conversion-event` need
// these predicates, and `queries/contact-filter/ctwa-retarget` already takes a
// type from `repositories/contact-inbox` — so hosting them there would close an
// import cycle (`madge` flags it even though that one is type-only).

const referral = contactInboxModel.referral

/** `referral.adId` is set AND `referral.source` marks a PAID placement. */
const paidAdReferral = (
  source: (typeof PAID_AD_REFERRAL_SOURCE)[keyof typeof PAID_AD_REFERRAL_SOURCE],
): SQL =>
  sql`(${referral}->>'adId' IS NOT NULL AND ${referral}->>'source' = ${source})`

/** WhatsApp's click id, present on every CTWA click except Status placements. */
const ctwaClickId = (): SQL =>
  sql`(${referral}->>'ctwaClid' IS NOT NULL AND ${referral}->>'ctwaClid' <> '')`

type AdConversationPredicate = () => SQL

/**
 * One predicate per ATTRIBUTION FAMILY — the axis that actually varies. Meta
 * gives the two families different webhook vocabularies, so they cannot share
 * one shape:
 *
 * - `ctwaClickId` — WhatsApp. Normally keyed on `referral.ctwaClid`, but a
 *   **Status ad placement omits `ctwa_clid` entirely** (Meta's WhatsApp
 *   `messages` webhook reference), leaving only the ad id; `source` must then
 *   confirm the placement was paid, since WhatsApp sets an ad id for organic
 *   `"post"` referrals too.
 * - `metaAdReferral` — Messenger/Instagram. No click id exists there at all.
 *
 * REPORTING ONLY. The CAPI attribution paths (`findAttributionByCtwaClid`,
 * `findAttributionByContactInbox`, `listWhatsappCtwaInboxesByContact(s)`) still
 * require a real `ctwaClid`: that click id is what they send back to Meta, so a
 * conversation without one cannot be reported to CAPI at all.
 */
const AD_CONVERSATION_PREDICATE_BY_FAMILY = {
  ctwaClickId: (): SQL =>
    sql`(${ctwaClickId()} OR ${paidAdReferral(PAID_AD_REFERRAL_SOURCE.whatsapp)})`,
  metaAdReferral: (): SQL => paidAdReferral(PAID_AD_REFERRAL_SOURCE.meta),
} satisfies Record<string, AdConversationPredicate>

type AdAttributionFamily = keyof typeof AD_CONVERSATION_PREDICATE_BY_FAMILY

/**
 * Adding an ads-eligible channel fails to compile until it is mapped here —
 * `satisfies Record<AdsEligibleChannelType, …>` is the cascade guard described
 * on `adsEligibleChannelTypes`. A channel that attributes like Messenger needs
 * one line; a genuinely new attribution shape needs one more family above.
 */
const AD_ATTRIBUTION_FAMILY_BY_CHANNEL = {
  whatsapp: "ctwaClickId",
  messenger: "metaAdReferral",
  instagram: "metaAdReferral",
} satisfies Record<AdsEligibleChannelType, AdAttributionFamily>

/**
 * "This ContactInbox came from a paid ad on `channel`."
 *
 * Callers must pair this with a `ContactInbox.channel` scope. The predicate
 * describes a referral SHAPE, and the shapes are only distinguishable by
 * convention (`"ADS"` vs `"ad"`) — nothing in the schema enforces that a row
 * carrying one shape belongs to that family's channel.
 */
export function adConversationPredicate(channel: AdsEligibleChannelType): SQL {
  return AD_CONVERSATION_PREDICATE_BY_FAMILY[
    AD_ATTRIBUTION_FAMILY_BY_CHANNEL[channel]
  ]()
}

/**
 * "…from a paid ad on ANY channel" — the `fromCtwaAd` contact-filter field and
 * the "All channels" analytics default, neither of which is channel-scoped.
 *
 * Built by OR-ing every FAMILY rather than every channel, so Messenger and
 * Instagram contribute their shared shape once; a new channel reusing an
 * existing family therefore changes nothing here.
 */
export function anyChannelAdConversationPredicate(): SQL {
  const families = Object.values(AD_CONVERSATION_PREDICATE_BY_FAMILY).map(
    (predicate) => predicate(),
  )
  return sql`(${sql.join(families, sql` OR `)})`
}
