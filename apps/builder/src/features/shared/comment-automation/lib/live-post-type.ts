import type { CommentPost } from "@chatbotx.io/database/partials"

/**
 * The `?postType=live` a create page receives from the "Select post type"
 * dialog. Anything else — absent, misspelled, hand-edited — means a regular
 * post automation, so a bad link degrades to the old form instead of a 404.
 */
export const LIVE_POST_TYPE_PARAM = "live"

export function isLivePostTypeParam(raw: unknown): boolean {
  return raw === LIVE_POST_TYPE_PARAM
}

/** The `post` a new automation starts from. */
export function initialCommentPost(isLive: boolean): CommentPost {
  return isLive ? { type: "live", value: [] } : { type: "all", value: [] }
}
