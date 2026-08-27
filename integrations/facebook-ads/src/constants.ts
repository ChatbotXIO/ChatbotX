export const GRAPH_API_URL = "https://graph.facebook.com"

export const DEFAULT_API_VERSION = "v23.0"

/**
 * Decision A (out/plan/ctm-ctid-ads-manager.md "Permission/token model"): the
 * Facebook Ads OAuth principal must ALSO hold the Page permissions needed to
 * create CTM/CTID/CTWA ads (page_id/instagram_actor_id in object_story_spec,
 * promoted_object.page_id, page_welcome_message). `pages_manage_ads` /
 * `pages_read_engagement` / `pages_show_list` are confirmed required by the
 * CTM/CTID guide. `whatsapp_business_management` is a Phase-0 HYPOTHESIS for
 * CTWA's promoted_object WhatsApp-number resolution — out/plan/ctwa-ads-manager.md
 * "CTWA prerequisite/asset linkage" — kept here so the OAuth consent screen
 * asks once, but the real CTWA gate is the (ad account, Page, WABA, phone
 * number) tuple-authorization check in Phase 0, not this scope alone.
 * // Phase 0 confirm: verify all 4 scopes are actually granted/required against
 * a live v23.0 token before removing this comment.
 */
export const FACEBOOK_ADS_SCOPES = [
  "ads_read",
  "ads_management",
  "pages_manage_ads",
  "pages_read_engagement",
  "pages_show_list",
  "whatsapp_business_management",
]

/** Facebook caps `limit` at 500 for these edges; 499 mirrors the legacy product. */
export const ADS_PAGE_LIMIT = 499

/** Cursor-pagination safety cap: 20 × 499 ≈ 10k items per listing. */
export const MAX_GRAPH_PAGES = 20

/** Graph API error code for an expired/invalidated access token. */
export const GRAPH_ERROR_CODE_INVALID_TOKEN = 190
