/**
 * Mirrors `IntegrationFacebookAdsStatus` — flipped to `invalid` on a Graph 190
 * (expired/invalidated token) so the tool can show the re-grant panel instead
 * of failing every list/create call.
 */
export const facebookMarketingMessagesAuthStatuses = [
  "active",
  "invalid",
] as const
export type FacebookMarketingMessagesAuthStatus =
  (typeof facebookMarketingMessagesAuthStatuses)[number]

export const facebookMarketingMessageBudgetTypes = [
  "daily",
  "lifetime",
] as const
export type FacebookMarketingMessageBudgetType =
  (typeof facebookMarketingMessageBudgetTypes)[number]

/**
 * Who a campaign messages. `optIn` = Page subscribers who opted in to
 * marketing messages; `customAudience` = a ready
 * `FacebookMarketingMessageAudience` on the same ad account and Page.
 */
export const facebookMarketingMessageTargetTypes = [
  "optIn",
  "customAudience",
] as const
export type FacebookMarketingMessageTargetType =
  (typeof facebookMarketingMessageTargetTypes)[number]

export const facebookMarketingMessageStatuses = [
  "notSent",
  "scheduled",
  "sending",
  "waitingNextDay",
  "paused",
  "stopped",
  "completed",
  "failed",
] as const
export type FacebookMarketingMessageStatus =
  (typeof facebookMarketingMessageStatuses)[number]

/** Statuses the delivery pipeline is still driving. */
export const MM_ACTIVE_STATUSES: FacebookMarketingMessageStatus[] = [
  "scheduled",
  "sending",
  "waitingNextDay",
]

export const facebookMarketingMessageStatusReasons = [
  "pageNotConnected",
  "quotaReached",
  "workspaceBlocked",
  "grantInvalid",
  "metaBlocker",
  "contentRejected",
  "noTokens",
  "noMatchingTopic",
  "tokenFetchFailed",
  "campaignEnded",
  "lifetimeBudgetReached",
] as const
export type FacebookMarketingMessageStatusReason =
  (typeof facebookMarketingMessageStatusReasons)[number]

export const facebookMarketingMessageRecipientStatuses = [
  "pending",
  "unconfirmed",
  "sent",
  "delivered",
  "failed",
] as const
export type FacebookMarketingMessageRecipientStatus =
  (typeof facebookMarketingMessageRecipientStatuses)[number]

export const MM_OPT_IN_TOPIC_TITLE = "Updates and promotions"
export const MM_START_DELAY_MS = 60 * 60 * 1000
export const MM_RETRY_DELAY_MS = 12 * 60 * 60 * 1000
export const MM_SENDS_PER_MINUTE = 500
// finalize treats unconfirmed older than this as failed "outcomeUnknown"
export const MM_UNCONFIRMED_GRACE_MS = 60 * 60 * 1000
// prepare keeps retrying a retryable token-snapshot error only this long after startsAt
export const MM_PREPARE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000
// a dispatch job stops calling Meta after this long; the next tick continues
export const MM_DISPATCH_WALL_MS = 45_000
// retry delay after a retryable token-snapshot or delivery-estimate failure
export const MM_BACKOFF_MS = 5 * 60 * 1000
// a lifetime campaign whose ad set has no end_time stops this long after creation
export const MM_LIFETIME_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000
// this many consecutive unclassified send errors with the same code pause the campaign
export const MM_UNKNOWN_ERROR_BREAKER = 5
