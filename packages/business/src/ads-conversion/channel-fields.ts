import type { AdsConversionChannel } from "@chatbotx.io/database/schema"
import {
  type AdReferralChannelType,
  adReferralChannelTypes,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"

// Deliberately imports ONLY a type from `@chatbotx.io/database` (erased at
// build time — zero runtime import). This file is also published as its own
// package subpath (`@chatbotx.io/business/ads-conversion/channel-fields`,
// see package.json `exports`) specifically so `"use client"` builder
// components (e.g. `ads-analytics-view.tsx`, `conversion-events-view.tsx`)
// can pull these maps/helpers WITHOUT importing the root `@chatbotx.io/
// business` barrel — that barrel re-exports `service.ts`, which eagerly
// loads `@chatbotx.io/database/repositories` and, transitively, the DB
// client (`env.DATABASE_URL`), which crashes in a browser/client bundle or
// test environment. The ONLY permitted runtime import is
// `@chatbotx.io/utils/channel` (zod-only, already client-safe — it is the
// canonical home of the channel value lists); keep everything else out.

/**
 * Channels ads attribution currently exists for (CTWA/CTM/CTID) — the
 * subset of `AdsConversionChannel` that actually has an integration FK
 * column plus an attribution/evaluation pipeline. `"facebook"` is excluded:
 * it is a dead `AdsConversionChannel` value (rule-consistency-only, no
 * `AdsConversionEvent` row is ever created for it — see the DB CHECK
 * constraint).
 *
 * Single source of truth for every "which channels does ads
 * attribution/tracking support" question across business/worker/builder —
 * consolidates what used to be a separate `CTWA_ELIGIBLE_CHANNELS` set in
 * `service.ts` plus scattered `channel === "messenger" || channel ===
 * "instagram"` unions. Adding a channel here is the ONE map entry a future
 * channel needs: every `satisfies Record<AdsEligibleChannel, ...>` map below
 * (and every caller keyed off `ADS_INTEGRATION_FK_BY_CHANNEL`) fails to
 * compile until it's threaded through.
 */
export type AdsEligibleChannel = Extract<
  AdsConversionChannel,
  (typeof adsEligibleChannelTypes.options)[number]
>

// Canonical value list lives in `@chatbotx.io/utils/channel`
// (`adsEligibleChannelTypes`) so the database layer — which cannot import
// this package — derives from the same source. The `satisfies` re-checks it
// against the DB `AdsConversionChannel` enum: a value present in utils but
// missing from the DB enum (or vice versa) fails to compile here.
export const ADS_ELIGIBLE_CHANNELS: readonly AdsEligibleChannel[] =
  adsEligibleChannelTypes.options satisfies readonly AdsEligibleChannel[]

const ADS_ELIGIBLE_CHANNEL_SET: ReadonlySet<string> = new Set(
  ADS_ELIGIBLE_CHANNELS,
)

/**
 * Cheap in-memory pre-filter (no DB lookup) for "does this channel currently
 * have CTWA/CTM/CTID attribution" — mirrors `AdsConversionService.
 * isEligibleChannel`, which delegates here.
 */
export function isAdsEligibleChannel(
  channel: string | null | undefined,
): channel is AdsEligibleChannel {
  return channel != null && ADS_ELIGIBLE_CHANNEL_SET.has(channel)
}

/**
 * The two channels that gate CTM/CTID attribution on Meta's ad-referral
 * fields (`referral.adId` + `referral.source === "ADS"`) instead of a
 * click-id (`ctwaClid`, WhatsApp-only). Derived from `AdsEligibleChannel`
 * minus `"whatsapp"` so a future ads-eligible channel added there is forced
 * to also declare itself here (or explicitly stay whatsapp-like) — see
 * `isAdReferralChannel`'s exhaustiveness check.
 */
export type AdReferralChannel = Extract<
  AdsEligibleChannel,
  AdReferralChannelType
>

const AD_REFERRAL_CHANNEL_SET: ReadonlySet<AdsEligibleChannel> = new Set(
  adReferralChannelTypes.options satisfies readonly AdReferralChannel[],
)

/**
 * Replaces the repeated `channel === "messenger" || channel === "instagram"`
 * union checks scattered across the ads-conversion evaluators — same
 * semantics (byte-for-byte), driven by a set instead of a literal union so
 * a future ad-referral channel only needs adding to `AD_REFERRAL_CHANNEL_SET`.
 * Accepts `null`/`undefined` since several callers narrow an optional
 * `channel` field straight off a parsed zod input.
 */
export function isAdReferralChannel(
  channel: AdsConversionChannel | null | undefined,
): channel is AdReferralChannel {
  return (
    channel != null &&
    AD_REFERRAL_CHANNEL_SET.has(channel as AdsEligibleChannel)
  )
}

/**
 * Single source of truth for "which `AdsConversionEvent`/`AdsConversionRule`
 * integration FK column belongs to this channel" — mirrors the
 * `channelUserDataBuilders` / `capi-scope-checkers` resolver-map pattern
 * used elsewhere in the ads-conversion pipeline.
 */
export const ADS_INTEGRATION_FK_BY_CHANNEL = {
  whatsapp: "integrationWhatsappId",
  messenger: "integrationMessengerId",
  instagram: "integrationInstagramId",
} as const satisfies Record<AdsEligibleChannel, string>

export type AdsIntegrationFkColumn =
  (typeof ADS_INTEGRATION_FK_BY_CHANNEL)[AdsEligibleChannel]

type PerChannelIntegrationIds<TAbsent> = {
  integrationWhatsappId: string | TAbsent
  integrationMessengerId: string | TAbsent
  integrationInstagramId: string | TAbsent
}

/**
 * Sets exactly the FK column matching `channel` to `integrationId`; every
 * other ads-eligible channel's FK is `undefined` — the shape query/filter
 * inputs need ("no constraint on this column"). Replaces the repeated
 * `channel === "messenger" ? integrationId : undefined` triplets across
 * `service.ts`/`send-conversion-event.ts`/the builder ads pages.
 *
 * `channel` takes the full `AdsConversionChannel` (not just
 * `AdsEligibleChannel`) so callers whose own input can carry the dead
 * `"facebook"` value (e.g. `hasEnabledTriggerRule`) keep compiling — a
 * non-eligible channel simply resolves every FK to `undefined`, same as the
 * ternary chains this replaces. `integrationId` accepts `undefined` too
 * (e.g. the builder ads page's "no integration selected yet" state) — an
 * absent id resolves every FK to `undefined` regardless of `channel`,
 * exactly what the ternary chain it replaces already produced.
 */
export function perChannelIntegrationIds(
  channel: AdsConversionChannel,
  integrationId: string | undefined,
): PerChannelIntegrationIds<undefined> {
  return {
    integrationWhatsappId: channel === "whatsapp" ? integrationId : undefined,
    integrationMessengerId: channel === "messenger" ? integrationId : undefined,
    integrationInstagramId: channel === "instagram" ? integrationId : undefined,
  }
}

/**
 * Same as `perChannelIntegrationIds`, but the non-matching columns are
 * explicit `null` instead of `undefined` — for insert-value shapes where
 * "no value" must be written as SQL NULL rather than "column omitted from
 * the object" (Drizzle `.values()` treats the two differently).
 */
export function perChannelIntegrationIdsOrNull(
  channel: AdsConversionChannel,
  integrationId: string,
): PerChannelIntegrationIds<null> {
  return {
    integrationWhatsappId: channel === "whatsapp" ? integrationId : null,
    integrationMessengerId: channel === "messenger" ? integrationId : null,
    integrationInstagramId: channel === "instagram" ? integrationId : null,
  }
}
