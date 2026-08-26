/**
 * SINGLE central manifest for every Meta Marketing API enum/literal value the
 * in-app messaging-ads manager (CTM/CTID/CTWA) sends or reads, pinned against
 * `DEFAULT_API_VERSION` (v23.0 — see `../constants.ts`). Sourced from:
 *   - out/plan/ctm-ctid-ads-manager.md (base CTM/CTID flow)
 *   - out/plan/ctwa-ads-manager.md (WhatsApp delta)
 * Every value is doc-derived; anything the Phase-0 live-token contract spike
 * (mandatory per both plans, not yet run) has not verified against a real
 * v23.0 response is flagged `// Phase 0 confirm`. Correcting an enum after
 * Phase 0 runs means editing ONLY this file — no other module should inline a
 * Meta literal.
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

// ---------------------------------------------------------------------------
// Ad set
// ---------------------------------------------------------------------------

/**
 * // Phase 0 confirm: the CTM/CTID guide's worked examples show
 * `optimization_goal: "IMPRESSIONS"` + `billing_event: "IMPRESSIONS"`; the
 * approved plan prefers `CONVERSATIONS` optimization (message-conversation
 * outcomes) paired with `LOWEST_COST_WITHOUT_CAP` bidding and NO `bid_amount`.
 * Both combinations are documented by Meta for messaging destinations —
 * which one v23.0 actually accepts for a given destination_type is a Phase 0
 * output. This is the ONE place to change the default once confirmed.
 */
export const MESSAGING_AD_SET_OPTIMIZATION_GOAL = "CONVERSATIONS" as const
export const MESSAGING_AD_SET_BILLING_EVENT = "IMPRESSIONS" as const
export const MESSAGING_AD_SET_BID_STRATEGY = "LOWEST_COST_WITHOUT_CAP" as const

/**
 * `destination_type` per channel. // Phase 0 confirm: docs also show a newer
 * `MESSAGING_*` enum family (`MESSAGING_MESSENGER`/`MESSAGING_INSTAGRAM_DIRECT`/
 * `MESSAGING_WHATSAPP`) — which family v23.0 accepts must be proven live
 * before this ships to real ad spend.
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
 * `call_to_action.type` per channel (CTM/CTID plan §CTA; CTWA delta).
 * `value.app_destination` is derived from the SAME per-channel value as
 * `destination_type` today — // Phase 0 confirm they never diverge.
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

export type PromotedObject = {
  page_id: string
  /**
   * // Phase 0 confirm (out/plan/ctwa-ads-manager.md): `whatsapp_phone_number`
   * (E.164 display number) vs `page_number_id` (the phone number's Graph
   *id*, e.g. `IntegrationWhatsapp.phoneNumberId`) are DIFFERENT fields with
   * different value forms — NOT interchangeable. Defaulting to the E.164
   * display number here because that is the field name shown in the CTWA
   * guide's worked example; verify against v23.0 in Phase 0.
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

// ---------------------------------------------------------------------------
// Durable operation correlation marker (Meta is not transactional — see
// out/plan/ctm-ctid-ads-manager.md "Durable operation model")
// ---------------------------------------------------------------------------

const CORRELATION_TAG_PREFIX = "[cbx:"
const CORRELATION_TAG_SUFFIX = "]"

/** Embeds the operationId into a user-facing object name, collision-safe. */
export function buildCorrelationName(
  label: string,
  operationId: string,
): string {
  return `${label} ${CORRELATION_TAG_PREFIX}${operationId}${CORRELATION_TAG_SUFFIX}`
}

/** Graph `filtering` query param value to find objects tagged with `operationId`. */
export function operationIdNameFilter(operationId: string): string {
  return JSON.stringify([
    {
      field: "name",
      operator: "CONTAIN",
      value: `${CORRELATION_TAG_PREFIX}${operationId}${CORRELATION_TAG_SUFFIX}`,
    },
  ])
}
