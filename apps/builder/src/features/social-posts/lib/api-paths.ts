/**
 * The dry-run routes of composed posts: `validate` and `preview` take the post
 * as a body, so they are POST, but write nothing. The authorize gate
 * (`authorize-workspace-access.ts`) lists them; the routes use these constants.
 */
export const SOCIAL_POST_VALIDATE_TOKEN_PATH = "/v1/posts/validate"
export const SOCIAL_POST_PREVIEW_TOKEN_PATH = "/v1/posts/preview"
export const SOCIAL_POST_VALIDATE_POST_PATH =
  "/workspaces/{workspaceId}/social-posts/validate"
export const SOCIAL_POST_PREVIEW_POST_PATH =
  "/workspaces/{workspaceId}/social-posts/preview"

/**
 * Pausing a repeating post only takes work away, so it must stay possible in a
 * trial-expired workspace (invariant 14), like the builder's other "stop" paths.
 * Gate-only allow-list in `authorize-workspace-access.ts`: a `read_only` token
 * still cannot call it. (Ending the series is a DELETE, already open.)
 */
export const SOCIAL_POST_RECURRENCE_PAUSE_TOKEN_PATH =
  "/v1/posts/{id}/recurrence/pause"
export const SOCIAL_POST_RECURRENCE_PAUSE_POST_PATH =
  "/workspaces/{workspaceId}/social-posts/{id}/recurrence/pause"

/**
 * Taking a post back to a draft only takes work away, so it stays possible in
 * a trial-expired workspace (invariant 14). The gate keys on the path, not the
 * body, so it is its own route; `reschedule` (any other change) stays blocked.
 * Gate-only allow-list in `authorize-workspace-access.ts`.
 */
export const SOCIAL_POST_UNSCHEDULE_TOKEN_PATH = "/v1/posts/{id}/unschedule"
export const SOCIAL_POST_UNSCHEDULE_POST_PATH =
  "/workspaces/{workspaceId}/social-posts/{id}/unschedule"
