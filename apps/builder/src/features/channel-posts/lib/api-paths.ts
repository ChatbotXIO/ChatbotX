/**
 * Routes of the Posts area that read through POST because their input does not
 * fit a query string. The authorize gate (`authorize-workspace-access.ts`)
 * lists them, so the paths live here and the routes use the same constants: a
 * rename cannot leave the gate behind.
 */
export const CHANNEL_POST_MERGE_VIEW_TOKEN_PATH =
  "/v1/channel-posts/management/merge-view"
export const CHANNEL_POST_MERGE_VIEW_POST_PATH =
  "/workspaces/{workspaceId}/channel-posts/management/merge-view"
export const CHANNEL_POST_EXPORT_TOKEN_PATH =
  "/v1/channel-posts/management/export"
/** Start of a read-from-channel comment export; its status is `{this path}/{fileId}`. */
export const CHANNEL_POST_COMMENT_EXPORTS_TOKEN_PATH =
  "/v1/channel-posts/management/exports"
export const CHANNEL_POST_COMMENT_EXPORTS_POST_PATH =
  "/workspaces/{workspaceId}/channel-posts/management/exports"
