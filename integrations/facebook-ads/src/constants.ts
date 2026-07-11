export const GRAPH_API_URL = "https://graph.facebook.com"

export const DEFAULT_API_VERSION = "v23.0"

export const FACEBOOK_ADS_SCOPES = ["ads_read", "ads_management"]

/** Facebook caps `limit` at 500 for these edges; 499 mirrors the legacy product. */
export const ADS_PAGE_LIMIT = 499

/** Cursor-pagination safety cap: 20 × 499 ≈ 10k items per listing. */
export const MAX_GRAPH_PAGES = 20

/** Graph API error code for an expired/invalidated access token. */
export const GRAPH_ERROR_CODE_INVALID_TOKEN = 190
