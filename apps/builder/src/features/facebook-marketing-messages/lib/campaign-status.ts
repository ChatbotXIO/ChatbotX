import {
  type FacebookMarketingMessageStatus,
  type FacebookMarketingMessageStatusReason,
  MM_ACTIVE_STATUSES,
} from "@chatbotx.io/database/partials"

const S = "facebookMarketingMessages.delivery.status" as const
const R = "facebookMarketingMessages.delivery.reason" as const

export const statusLabelKey = {
  notSent: `${S}.notSent`,
  scheduled: `${S}.scheduled`,
  sending: `${S}.sending`,
  waitingNextDay: `${S}.waitingNextDay`,
  paused: `${S}.paused`,
  stopped: `${S}.stopped`,
  completed: "fields.status.completed",
  failed: "fields.status.failed",
} as const satisfies Record<FacebookMarketingMessageStatus, string>

export const reasonLabelKey = {
  pageNotConnected: `${R}.pageNotConnected`,
  quotaReached: `${R}.quotaReached`,
  workspaceBlocked: `${R}.workspaceBlocked`,
  grantInvalid: `${R}.grantInvalid`,
  metaBlocker: `${R}.metaBlocker`,
  contentRejected: `${R}.contentRejected`,
  noTokens: `${R}.noTokens`,
  noMatchingTopic: `${R}.noMatchingTopic`,
  tokenFetchFailed: `${R}.tokenFetchFailed`,
  campaignEnded: `${R}.campaignEnded`,
  lifetimeBudgetReached: `${R}.lifetimeBudgetReached`,
} as const satisfies Record<FacebookMarketingMessageStatusReason, string>

export const isActiveStatus = (s: FacebookMarketingMessageStatus) =>
  MM_ACTIVE_STATUSES.includes(s)

export const canStop = (s: FacebookMarketingMessageStatus) =>
  isActiveStatus(s) || s === "paused"
export const canResume = (s: FacebookMarketingMessageStatus) =>
  s === "paused" || s === "stopped"
export const canSend = (s: FacebookMarketingMessageStatus) => s === "notSent"

/**
 * Meta's message for a retryable problem (throttling, not ready yet, a
 * failed delivery estimate) on a campaign that is still active. The delivery
 * service records it without changing the status and clears it on the next
 * success, so the UI shows it as a "retrying" warning.
 */
export const retryWarningMessage = (stats: {
  status: FacebookMarketingMessageStatus
  statusReason: FacebookMarketingMessageStatusReason | null
  statusErrorMessage: string | null
}): string | null =>
  isActiveStatus(stats.status) && !stats.statusReason
    ? stats.statusErrorMessage || null
    : null
