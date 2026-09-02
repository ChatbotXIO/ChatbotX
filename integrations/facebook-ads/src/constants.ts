export const GRAPH_API_URL = "https://graph.facebook.com"

export const DEFAULT_API_VERSION = "v23.0"

/**
 * Decision A (out/plan/ctm-ctid-ads-manager.md "Permission/token model"): the
 * Facebook Ads OAuth principal must ALSO hold the Page permissions needed to
 * create CTM/CTID/CTWA ads (page_id/instagram_actor_id in object_story_spec,
 * promoted_object.page_id, page_welcome_message). `pages_manage_ads` /
 * `pages_read_engagement` / `pages_show_list` are confirmed required by the
 * CTM/CTID guide.
 *
 * CHANNEL-SPECIFIC scopes do NOT belong here: `whatsapp_business_management`
 * (CTWA-only, Phase-0 hypothesis for promoted_object WhatsApp-number
 * resolution) lives in the per-channel additions map
 * (`messaging-ads-scopes.ts` `MESSAGING_ADS_EXTRA_SCOPES.whatsapp`) so a
 * CTM/CTID connect never asks the user for a WhatsApp permission it does not
 * use.
 */
export const FACEBOOK_ADS_SCOPES = [
  "ads_read",
  "ads_management",
  "pages_manage_ads",
  "pages_read_engagement",
  "pages_show_list",
]

/** Facebook caps `limit` at 500 for these edges; 499 mirrors the legacy product. */
export const ADS_PAGE_LIMIT = 499

/** Cursor-pagination safety cap: 20 × 499 ≈ 10k items per listing. */
export const MAX_GRAPH_PAGES = 20

/** Graph API error code for an expired/invalidated access token. */
export const GRAPH_ERROR_CODE_INVALID_TOKEN = 190
