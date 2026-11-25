export const POST_FEED_URL_TAKEN_CODE = "feedUrlTaken"
export const POST_FEED_COOLDOWN_CODE = "feedCheckCooldown"
export const POST_FEED_PREVIEW_RATE_CODE = "feedPreviewRateLimited"
/** A check of the feed is already waiting or running, so "run now" would queue nothing. */
export const POST_FEED_IN_PROGRESS_CODE = "feedCheckInProgress"
export const POST_FEED_NOT_ACTIVE_CODE = "feedNotActive"
/** The address answered but is not an RSS or Atom feed; `data.suggestedUrl` may name the feed the page advertises. */
export const POST_FEED_NOT_PARSEABLE_CODE = "feedNotParseable"
/** The address could not be fetched (unreachable, timed out, too large, refused status). */
export const POST_FEED_UNREACHABLE_CODE = "feedUnreachable"
export const POST_FEED_TEST_RATE_CODE = "feedTestRateLimited"
export const POST_FEED_NO_ITEMS_CODE = "feedHasNoItems"
/** The workspace fetched too many outside feed addresses in an hour (save, address change, item draft). */
export const POST_FEED_FETCH_RATE_CODE = "feedFetchRateLimited"
export const POST_FEED_FETCH_UNAVAILABLE_CODE = "feedFetchUnavailable"
