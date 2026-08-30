import type { SpecialAdCategory } from "./constants"

// ---------------------------------------------------------------------------
// Targeting (Ad Set) — Phase 1 covers geo/age/gender/locale/device targeting;
// flexible_spec (interests/behaviors) and custom_audiences are Phase 3.
// ---------------------------------------------------------------------------

export type MessagingAdGeoLocations = {
  countries: string[]
}

/** Meta's targeting gender codes: 1 = male, 2 = female. Omit for "all". */
export type MessagingAdGender = 1 | 2

export type MessagingAdTargeting = {
  geo_locations: MessagingAdGeoLocations
  /**
   * REQUIRED on ad set CREATE since Graph v23.0 (error code 100 "Advantage
   * Audience Flag Required" otherwise — Meta enforces this even for
   * countries-only targeting despite the docs' "default setup" carve-out).
   * `1` opts in to Advantage+ audience; NOTE: with `1` Meta rejects `age_max`
   * and only allows `age_min` 18–25, so custom age/gender targeting must
   * send `0`.
   */
  targeting_automation: { advantage_audience: 0 | 1 }
  age_min?: number
  age_max?: number
  genders?: MessagingAdGender[]
  /** Meta locale codes (e.g. 1033 = en_US). */
  locales?: number[]
  device_platforms?: ("mobile" | "desktop")[]
  /**
   * Phase 1: omitted entirely so Meta uses automatic placements — never
   * hard-lock `publisher_platforms` per channel (out/plan/ctm-ctid-ads-manager.md
   * "Placements"). Typed here so a future Phase-0-pinned compatibility matrix
   * can populate it without a shape change.
   */
  publisher_platforms?: string[]
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export type CreateCampaignInput = {
  accessToken: string
  adAccountId: string
  /** User-facing object name shown in Meta Ads Manager. */
  name: string
  specialAdCategories: SpecialAdCategory[]
  /** Required by Meta when a restricted special ad category applies to a specific market. */
  specialAdCategoryCountry?: string[]
  version?: string
}

export type MetaCampaign = {
  id: string
  /** Absent on CREATE responses (Meta returns only `{ id }`); present on GET/LIST. */
  name?: string
  status?: string
  effective_status?: string
}

// ---------------------------------------------------------------------------
// Ad Set
// ---------------------------------------------------------------------------

export type CreateAdSetInput = {
  accessToken: string
  adAccountId: string
  campaignId: string
  /** User-facing object name shown in Meta Ads Manager. */
  name: string
  /** Integer minor currency units (e.g. cents for USD). */
  dailyBudgetMinorUnits: number
  destinationType: string
  promotedObject: { page_id: string; whatsapp_phone_number?: string }
  targeting: MessagingAdTargeting
  startTime?: string
  endTime?: string
  version?: string
}

export type MetaAdSet = {
  id: string
  /** Absent on CREATE responses (Meta returns only `{ id }`); present on GET/LIST. */
  name?: string
  status?: string
  effective_status?: string
}

// ---------------------------------------------------------------------------
// Ad Creative
// ---------------------------------------------------------------------------

export type LinkData = {
  message?: string
  link: string
  image_hash?: string
  name?: string
  description?: string
  caption?: string
  /** Messaging CTA lives INSIDE the media spec, not at object_story_spec level. */
  call_to_action?: CallToAction
  /**
   * `page_welcome_message` also lives INSIDE the media spec (`link_data`/
   * `video_data`), next to `call_to_action` — NOT at the `object_story_spec`
   * top level. Every Meta messaging-ads example (Click-to-Messenger/Instagram/
   * WhatsApp + Multidestination) nests it here; a top-level value is dropped.
   * Value is the JSON-string from `buildPageWelcomeMessage`.
   */
  page_welcome_message?: string
}

export type VideoData = {
  video_id: string
  image_hash?: string
  title?: string
  message?: string
  link_description?: string
  /** Messaging CTA lives INSIDE the media spec, not at object_story_spec level. */
  call_to_action?: CallToAction
  /** See `LinkData.page_welcome_message` — nested here, never at object_story_spec top level. */
  page_welcome_message?: string
}

export type CreativeMedia =
  | { kind: "image"; linkData: LinkData }
  | { kind: "video"; videoData: VideoData }

/** A single message shown in the "series of up to 5 templates" welcome-message editor. */
export type PageWelcomeMessageTemplate = {
  heading?: string
  message: string
  quickReplies?: { title: string }[]
}

/**
 * // Phase 0 confirm: the exact `page_welcome_message` JSON contract (single
 * vs. up-to-5-template test set, quick-reply shape) is pinned from Meta's
 * "Page Welcome Message" guide structure but NOT live-verified against
 * v23.0. `messaging-ads/welcome-message.ts` centralizes the JSON assembly so
 * a Phase-0 correction touches one function.
 */
export type PageWelcomeMessage =
  | { type: "default" }
  | { type: "single"; message: string; quickReplies?: { title: string }[] }
  | { type: "templates"; templates: PageWelcomeMessageTemplate[] }

export type CallToAction = {
  type: string
  value: {
    app_destination: string
    link?: string
  }
}

export type CreateAdCreativeInput = {
  accessToken: string
  adAccountId: string
  /** User-facing object name shown in Meta Ads Manager. */
  name: string
  pageId: string
  /** CTID only. */
  instagramActorId?: string
  media: CreativeMedia
  pageWelcomeMessage: PageWelcomeMessage
  callToAction: CallToAction
  version?: string
}

export type MetaAdCreative = {
  id: string
}

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------

export type CreateAdInput = {
  accessToken: string
  adAccountId: string
  /** User-facing object name shown in Meta Ads Manager. */
  name: string
  adSetId: string
  creativeId: string
  version?: string
}

export type MetaAd = {
  id: string
  /** Absent on CREATE responses (Meta returns only `{ id }`); present on GET/LIST. */
  name?: string
  status?: string
  effective_status?: string
}

// ---------------------------------------------------------------------------
// Media upload
// ---------------------------------------------------------------------------

export type UploadAdImageInput = {
  accessToken: string
  adAccountId: string
  fileName: string
  bytes: Uint8Array
  mimeType: string
  version?: string
}

export type UploadAdVideoInput = {
  accessToken: string
  adAccountId: string
  fileName: string
  bytes: Uint8Array
  mimeType: string
  version?: string
}

export type AdVideoStatus = {
  videoId: string
  /** Meta's raw `status.video_status` value (e.g. "ready", "processing", "error"). */
  status: string
  isReady: boolean
  isError: boolean
}

// ---------------------------------------------------------------------------
// Ad account details
// ---------------------------------------------------------------------------

export type AdAccountDetails = {
  id: string
  name?: string
  currency: string
  timezoneName: string
  /** Meta account_status: 1 = ACTIVE, others = disabled/unsettled/pending closure/etc. */
  accountStatus: number
  /**
   * // Phase 0 confirm: there is no single documented "account minimum
   * budget" field guaranteed present on every ad account — `min_daily_budget`
   * is requested best-effort and may be absent for some accounts/currencies.
   */
  minDailyBudgetMinorUnits?: number
}

// ---------------------------------------------------------------------------
// Ads Insights (performance) — compact per-ad shape returned by
// `getMessagingAdsInsightsByAdIds` (`../apis/insights.ts`) for the box's
// separate "Ads Insights" read (loaded via its own API call so the ads LIST
// stays fast — never merged into `MetaAd`/`listMessagingAdsByIds`).
// ---------------------------------------------------------------------------

export type MessagingAdInsight = {
  adId: string
  /**
   * The ad account's currency (Meta `account_currency`, e.g. "USD", "VND") —
   * so `spend`/`costPerConversation` are formatted in the account's own
   * currency, never a hard-coded assumption. `null` when Meta omits it (an ad
   * with no delivery has no insights row, so this is populated whenever any
   * monetary figure is).
   */
  currency: string | null
  impressions: number
  reach: number
  spend: number
  clicks: number
  /**
   * Messaging conversations started — from `actions[]`, matched by the
   * per-channel `action_type` in
   * `MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL`. `0` when Meta
   * reports no matching action (e.g. no delivery yet).
   */
  conversations: number
  /**
   * From `cost_per_action_type[]`, same `action_type`. `null` when Meta has
   * no cost-per-action figure for it (e.g. zero conversions so far).
   */
  costPerConversation: number | null
}
