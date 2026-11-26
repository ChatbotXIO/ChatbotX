/**
 * Pausing a feed only takes work away, so it must stay possible in a
 * trial-expired workspace (invariant 14), like the builder's other "stop"
 * paths. Gate-only allow-list in `authorize-workspace-access.ts`: a `read_only`
 * token still cannot call it. (Deleting a feed is a DELETE, already open.)
 */
export const POST_FEED_PAUSE_TOKEN_PATH = "/v1/post-feeds/{id}/pause"
export const POST_FEED_PAUSE_POST_PATH =
  "/workspaces/{workspaceId}/post-feeds/{id}/pause"

/**
 * Bulk delete is a POST (it takes a body), but like a single DELETE it only
 * takes work away, so it stays open in a trial-expired workspace (invariant 14).
 */
export const POST_FEED_BULK_DELETE_TOKEN_PATH = "/v1/post-feeds/bulk-delete"
export const POST_FEED_BULK_DELETE_POST_PATH =
  "/workspaces/{workspaceId}/post-feeds/bulk-delete"
