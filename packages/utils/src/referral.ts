import { z } from "zod"

/**
 * `referral.source` on a Messenger/Instagram ad referral — Meta's own
 * `messaging_referrals` vocabulary, stored verbatim by `normalizeMetaAdReferral`.
 *
 * WhatsApp is deliberately absent. Its referral carries `source_type`, whose
 * value set Meta does not document: every webhook reference writes it as a
 * literal `"ad"` with no parameter entry beside the ones it gives `source_id`,
 * `source_url` and the rest. Keying a query on a value list we cannot cite
 * would risk dropping paid conversations, which is the opposite of the intent —
 * so WhatsApp attribution stays on `ctwa_clid`, the field Meta does document.
 */
export const metaReferralSources = z.enum(["ADS", "SHORTLINK"])
export type MetaReferralSource = z.infer<typeof metaReferralSources>

/** The `referral.source` value that means "this came from a PAID ad". */
export const PAID_AD_REFERRAL_SOURCE = {
  meta: metaReferralSources.enum.ADS,
} as const

export type PaidAdReferralSource =
  (typeof PAID_AD_REFERRAL_SOURCE)[keyof typeof PAID_AD_REFERRAL_SOURCE]

/**
 * Every "this came from a paid ad" `referral.source`, for callers that test a
 * single already-loaded referral rather than building SQL per channel
 * (`resolveAdReferral`). Derived from the map above so the two cannot drift.
 */
export const PAID_AD_REFERRAL_SOURCES: readonly PaidAdReferralSource[] =
  Object.values(PAID_AD_REFERRAL_SOURCE)
