export const MAX_BUTTONS = 3

export const API_URL = "https://graph.instagram.com"

export const INSTAGRAM_OAUTH_URL = "https://api.instagram.com"

export const DEFAULT_API_VERSION = "v22.0"

export const INSTAGRAM_BUSINESS_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
]

/**
 * `force_reauth` for Business Login: Instagram asks for the professional
 * account's credentials even when the browser or app is already signed in.
 * Meta added it to fix a broken login and recommends it when users connect
 * on mobile (Instagram Platform changelog, June 14, 2025):
 * https://developers.facebook.com/documentation/instagram-platform/changelog/
 * It also stops a signed-in account from being picked silently when the user
 * meant to connect another one.
 */
export const INSTAGRAM_FORCE_REAUTH = "true"

export const FACEBOOK_GRAPH_API_URL = "https://graph.facebook.com"

/** Graph version used when publishing through the Facebook Login flavour. */
export const FACEBOOK_GRAPH_API_VERSION = "v23.0"
