import { z } from "zod"

/**
 * `referral.source` on a Messenger/Instagram ad referral — Meta's own
 * `messaging_referrals` vocabulary, stored verbatim by `normalizeMetaAdReferral`.
 */
export const metaReferralSources = z.enum(["ADS", "SHORTLINK"])
export type MetaReferralSource = z.infer<typeof metaReferralSources>

/**
 * `referral.source` on a WhatsApp referral. WhatsApp's payload has no `source`
 * field of its own — `getWhatsappReferral` stores Meta's `source_type` there,
 * whose vocabulary is entirely separate from the Messenger/Instagram one
 * above: lowercase, and it distinguishes a paid placement from an organic post
 * rather than an ad from a link.
 */
export const whatsappReferralSources = z.enum(["ad", "post"])
export type WhatsappReferralSource = z.infer<typeof whatsappReferralSources>

/**
 * The one `referral.source` value per channel family that means "this
 * conversation came from a PAID ad".
 *
 * The two vocabularies never collide (`"ADS"` vs `"ad"`), which is why a row's
 * channel family used to be inferrable from `source` alone — but that is a
 * coincidence of Meta's naming, not a guarantee, so every query keying on
 * these also scopes by `ContactInbox.channel`.
 */
export const PAID_AD_REFERRAL_SOURCE = {
  meta: metaReferralSources.enum.ADS,
  whatsapp: whatsappReferralSources.enum.ad,
} as const

export type PaidAdReferralSource =
  (typeof PAID_AD_REFERRAL_SOURCE)[keyof typeof PAID_AD_REFERRAL_SOURCE]

/**
 * Every "this came from a paid ad" `referral.source`, for the callers that
 * test a single already-loaded referral rather than building SQL per channel
 * (`resolveAdReferral`). Derived from the map above so the two can never drift.
 */
export const PAID_AD_REFERRAL_SOURCES: readonly PaidAdReferralSource[] =
  Object.values(PAID_AD_REFERRAL_SOURCE)
