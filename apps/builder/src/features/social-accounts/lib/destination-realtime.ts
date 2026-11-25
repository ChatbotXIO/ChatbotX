import { SCOPES_RECHECKED_STATUS } from "@chatbotx.io/utils/publish-destination"

/**
 * The `socialPostChanged` statuses that can change what a destination shows
 * (its state, missing permissions or publishing pause):
 * - `scopesRechecked`: the permission re-check wrote stored permissions;
 * - `failed`: a target settled as failed, which is how a rejected token, a
 *   missing permission or a platform limit (publishing pause) is recorded.
 * Every other status (processing, published, scheduled, a metrics refresh, ...)
 * leaves destinations as they were, so it must not refetch them.
 */
const DESTINATION_CHANGING_STATUSES: ReadonlySet<string> = new Set([
  SCOPES_RECHECKED_STATUS,
  "failed",
])

export const changesPublishDestinations = (status: string): boolean =>
  DESTINATION_CHANGING_STATUSES.has(status)
