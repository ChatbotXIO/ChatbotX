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
