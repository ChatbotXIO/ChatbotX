/**
 * SINGLE central manifest for every Meta Marketing API enum/literal value the
 * in-app messaging-ads manager (CTM/CTID/CTWA) sends or reads, pinned against
 * `DEFAULT_API_VERSION` (v23.0 — see `../constants.ts`). Sourced from:
 *   - out/plan/ctm-ctid-ads-manager.md (base CTM/CTID flow)
 *   - out/plan/ctwa-ads-manager.md (WhatsApp delta)
 * Every create-side value here has been verified against the v23.0 docs AND a
 * live ad create (campaign → ad set → creative → ad). The few values that a
 * live create does NOT exercise — read-side insights `action_type` (attribution
 * window per destination) and the `page_welcome_message` JSON contract — are
 * still flagged `// Phase 0 confirm`. Correcting an enum means editing ONLY
 * this file — no other module should inline a Meta literal.
 */

export type MessagingAdChannel = "messenger" | "instagram" | "whatsapp"

export const MESSAGING_AD_CHANNELS: readonly MessagingAdChannel[] = [
  "messenger",
  "instagram",
  "whatsapp",
]

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

/** Fixed objective for the MVP messaging path — do NOT reuse for OUTCOME_TRAFFIC/OUTCOME_SALES flows. */
export const MESSAGING_CAMPAIGN_OBJECTIVE = "OUTCOME_ENGAGEMENT" as const

export const CAMPAIGN_BUYING_TYPE_AUCTION = "AUCTION" as const

export const META_STATUS = {
  paused: "PAUSED",
  active: "ACTIVE",
  deleted: "DELETED",
  archived: "ARCHIVED",
} as const

/**
 * Meta's `special_ad_categories` enum. Selecting a value other than "NONE"
 * triggers server-side targeting restriction (see
 * `messaging-ads/special-ad-category.ts`) — never treat this as UI-only.
 */
export const specialAdCategories = [
  "NONE",
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "FINANCIAL_PRODUCTS_SERVICES",
  "ISSUES_ELECTIONS_POLITICS",
  "ONLINE_GAMBLING_AND_GAMING",
] as const
export type SpecialAdCategory = (typeof specialAdCategories)[number]

/**
 * ONLY Housing/Employment/Credit strip age/gender/detailed targeting. This is
 * intentional and NOT missing `ISSUES_ELECTIONS_POLITICS`: social-issues/
 * elections/politics ads carry different rules (e.g. an 18+ minimum, disclaimer
 * requirements) — not the HEC audience-field strip — so they must NOT be added
 * here. // Phase 0 confirm any per-region 18+ floor the API enforces.
 */
export const RESTRICTED_SPECIAL_AD_CATEGORIES: readonly SpecialAdCategory[] = [
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "FINANCIAL_PRODUCTS_SERVICES",
]

/**
 * Categories for which Meta HARD-REQUIRES `special_ad_category_country`.
 * Per Meta's Special Ad Categories docs this is ONLY
 * `ISSUES_ELECTIONS_POLITICS` ("you must also set a special_ad_category_country").
 * For HOUSING/EMPLOYMENT/CREDIT/FINANCIAL_PRODUCTS_SERVICES the country is
 * OPTIONAL — the docs say it "will default to your listed tax country, if it is
 * not set" — so never force it there.
 */
export const COUNTRY_REQUIRED_SPECIAL_AD_CATEGORIES: readonly SpecialAdCategory[] =
  ["ISSUES_ELECTIONS_POLITICS"]

/** True when the chosen categories include one that hard-requires a country. */
export function requiresSpecialAdCategoryCountry(
  categories: readonly string[],
): boolean {
  const required = COUNTRY_REQUIRED_SPECIAL_AD_CATEGORIES as readonly string[]
  return categories.some((category) => required.includes(category))
}

// ---------------------------------------------------------------------------
// Ad set
// ---------------------------------------------------------------------------

/**
 * Verified against Meta Marketing API v23.0 docs AND a live ad-set create:
 * under `OUTCOME_ENGAGEMENT` the docs list `CONVERSATIONS` as a valid
 * `optimization_goal` ("Engagement objective can optimize for CONVERSATIONS"),
 * paired with `billing_event: "IMPRESSIONS"` and `LOWEST_COST_WITHOUT_CAP`
 * bidding — which requires NO `bid_amount` (docs: `bid_amount` is required only
 * for `*_BID_CAP`/`COST_CAP` strategies). This is the ONE place to change the
 * default if the desired optimization ever changes.
 *
 * NOTE (v23.0 enforcement, observed live): ad set CREATE additionally requires
 * an explicit `targeting.targeting_automation.advantage_audience` (0|1) or
 * Meta rejects with code 100 "Advantage Audience Flag Required" — even for
 * countries-only targeting. The flag is set in `mapTargeting`
 * (`@chatbotx.io/business` messaging-ads mappers), typed required on
 * `MessagingAdTargeting`.
 */
export const MESSAGING_AD_SET_OPTIMIZATION_GOAL = "CONVERSATIONS" as const
export const MESSAGING_AD_SET_BILLING_EVENT = "IMPRESSIONS" as const
export const MESSAGING_AD_SET_BID_STRATEGY = "LOWEST_COST_WITHOUT_CAP" as const

/**
 * `destination_type` per channel. Verified against v23.0 docs + a live ad-set
 * create: single-destination in-app click-to-message ads use `MESSENGER` /
 * `INSTAGRAM_DIRECT` / `WHATSAPP`. The newer `MESSAGING_*` enum family
 * (`MESSAGING_MESSENGER`/`MESSAGING_INSTAGRAM_DIRECT`/`MESSAGING_WHATSAPP`) is
 * for the SEPARATE website-to-messaging and click-to-multidestination flows,
 * which this manager does not use.
 */
export const MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL: Record<
  MessagingAdChannel,
  string
> = {
  messenger: "MESSENGER",
  instagram: "INSTAGRAM_DIRECT",
  whatsapp: "WHATSAPP",
}

/**
 * `call_to_action.type` per channel — verified against v23.0 docs: the three
 * messaging CTAs are exactly `MESSAGE_PAGE` (Messenger), `INSTAGRAM_MESSAGE`
 * (Instagram) and `WHATSAPP_MESSAGE` (WhatsApp). `value.app_destination` uses
 * the same per-channel value as `destination_type` (docs show the CTA carrying
 * `{app_destination: MESSENGER}` etc.).
 */
export const MESSAGING_AD_CTA_TYPE_BY_CHANNEL: Record<
  MessagingAdChannel,
  string
> = {
  messenger: "MESSAGE_PAGE",
  instagram: "INSTAGRAM_MESSAGE",
  whatsapp: "WHATSAPP_MESSAGE",
}

// ---------------------------------------------------------------------------
// Ads Insights (performance) — Ads Insights read for the box's separate
// "performance" panel (impressions/reach/spend/clicks/messaging conversations
// started/cost-per-conversation), never joined into `listMessagingAdsByIds`.
// ---------------------------------------------------------------------------

/**
 * `action_type` Meta's `/insights` `actions[]`/`cost_per_action_type[]`
 * arrays use for "messaging conversation started" — per-channel-overridable
 * (mirrors `messagingAdConfigByChannel`) so a Phase-0 correction touches ONE
 * place. // Phase 0 confirm: the CTM/CTID/CTWA guides' worked examples all
 * show the same 7-day click-attribution
 * `onsite_conversion.messaging_conversation_started_7d` value for this
 * metric, but the exact `action_type` (and its attribution-window suffix)
 * MAY differ per destination (Messenger vs Instagram Direct vs WhatsApp) —
 * not yet verified against a live v23.0 response for all three.
 */
export const MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL: Record<
  MessagingAdChannel,
  string
> = {
  messenger: "onsite_conversion.messaging_conversation_started_7d",
  instagram: "onsite_conversion.messaging_conversation_started_7d",
  whatsapp: "onsite_conversion.messaging_conversation_started_7d",
}

/** Kind of `promoted_object` payload a channel's ad set needs. */
export type PromotedObjectKind = "pageOnly" | "pageAndWhatsappNumber"

export type MessagingAdChannelConfig = {
  destinationType: string
  ctaType: string
  /** `call_to_action.value.app_destination` — derived, never user-chosen. */
  ctaAppDestination: string
  /** CTID requires `object_story_spec.instagram_actor_id`. */
  needsInstagramActor: boolean
  promotedObjectKind: PromotedObjectKind
}

/**
 * Channel-agnostic config map — mirrors the `channelUserDataBuilders` /
 * `ADS_INTEGRATION_FK_BY_CHANNEL` resolver-map pattern used elsewhere in the
 * ads pipeline (`packages/business/src/ads-conversion/channel-fields.ts`,
 * `integrations/meta-conversions/src/apis/events.ts`). Every per-channel
 * derived value used by the create/publish flow lives HERE — no channel
 * `if`/`switch` belongs in the API or business layers.
 */
export const messagingAdConfigByChannel: Record<
  MessagingAdChannel,
  MessagingAdChannelConfig
> = {
  messenger: {
    destinationType: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.messenger,
    ctaType: MESSAGING_AD_CTA_TYPE_BY_CHANNEL.messenger,
    ctaAppDestination: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.messenger,
    needsInstagramActor: false,
    promotedObjectKind: "pageOnly",
  },
  instagram: {
    destinationType: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.instagram,
    ctaType: MESSAGING_AD_CTA_TYPE_BY_CHANNEL.instagram,
    ctaAppDestination: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.instagram,
    needsInstagramActor: true,
    promotedObjectKind: "pageOnly",
  },
  whatsapp: {
    destinationType: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.whatsapp,
    ctaType: MESSAGING_AD_CTA_TYPE_BY_CHANNEL.whatsapp,
    ctaAppDestination: MESSAGING_AD_DESTINATION_TYPE_BY_CHANNEL.whatsapp,
    needsInstagramActor: false,
    promotedObjectKind: "pageAndWhatsappNumber",
  },
}

// ---------------------------------------------------------------------------
// Ad creative image storage — NOT a Meta API literal, but colocated here (a
// plain-literal, `ky`/server-import-free file) as the SINGLE shared manifest
// the browser upload button, the create-time preflight, and the oRPC schema
// all import, so the byte cap / MIME allowlist / storage prefix can never
// drift between client and server.
// ---------------------------------------------------------------------------

/** ~10MB — mirrors the former ~10MB base64-char cap, now a real byte limit checked via `headObject` BEFORE any bytes are buffered. */
export const MAX_MESSAGING_AD_IMAGE_BYTES = 10 * 1024 * 1024

export const MESSAGING_AD_IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const
export type MessagingAdImageMimeType =
  (typeof MESSAGING_AD_IMAGE_MIME_ALLOWLIST)[number]

/**
 * `File.subType` (and the presigned-upload request `type`) tag for a
 * messaging-ad creative image upload — the create-time preflight's ownership
 * proof rejects any `File` row not carrying this tag. Duplicated as a plain
 * literal (not imported) in `packages/database/src/partials/file.ts`'s
 * `uploadTypes` enum and `apps/builder/.../features/import/schemas/presign.ts`'s
 * `subType` union, the same way `messagingAdChannelTypes` duplicates
 * `adsEligibleChannelTypes` — `database`/`apps/builder` cannot depend on this
 * integration package for a single string literal.
 */
export const MESSAGING_AD_CREATIVE_UPLOAD_KIND = "adsCampaignCreative" as const

/**
 * Presigned-upload storage prefix for one workspace's ad-creative images —
 * shared by the browser uploader (`uploadPath`), the upload-path authz
 * handler, and the create-time preflight's ownership check so they can never
 * drift apart. No trailing slash (callers append one when checking a strict
 * prefix match).
 */
export function buildMessagingAdCreativeStoragePrefix(
  workspaceId: string,
): string {
  return `public/space/${workspaceId}/ads-campaign/creatives`
}

export type PromotedObject = {
  page_id: string
  /**
   * Verified against v23.0 docs: the WhatsApp click-to-message `promoted_object`
   * carries `whatsapp_phone_number` — a numeric string, the WhatsApp phone
   * number for the promoted ad. It is NOT `page_number_id` (the phone number's
   * Graph id) — different field, different value form.
   */
  whatsapp_phone_number?: string
}

/**
 * Per-channel `promoted_object` builder — the other half of the config-map
 * pattern above. `whatsappPhoneNumber` must already be normalized E.164
 * without the leading `+` (mirrors `normalizeWhatsappDisplayPhoneNumber` in
 * `integrations/whatsapp`).
 */
export function buildPromotedObject(
  channel: MessagingAdChannel,
  input: { pageId: string; whatsappPhoneNumber?: string | null },
): PromotedObject {
  const config = messagingAdConfigByChannel[channel]
  if (config.promotedObjectKind === "pageOnly") {
    return { page_id: input.pageId }
  }
  if (!input.whatsappPhoneNumber) {
    throw new Error(
      "buildPromotedObject: whatsapp channel requires whatsappPhoneNumber",
    )
  }
  return {
    page_id: input.pageId,
    whatsapp_phone_number: input.whatsappPhoneNumber,
  }
}
