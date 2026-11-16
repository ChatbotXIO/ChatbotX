export const ChannelErrorCategory = {
  RATE_LIMITED: "rate_limited",
  AUTH_FAILED: "auth_failed",
  USER_BLOCKED: "user_blocked",
  INVALID_RECIPIENT: "invalid_recipient",
  PERMISSION_DENIED: "permission_denied",
  PAYLOAD_INVALID: "payload_invalid",
  QUOTA_EXCEEDED: "quota_exceeded",
  NETWORK_ERROR: "network_error",
  UNKNOWN: "unknown",
} as const

export type ChannelErrorCategory =
  (typeof ChannelErrorCategory)[keyof typeof ChannelErrorCategory]

export const RETRYABLE_CATEGORIES = new Set<ChannelErrorCategory>([
  ChannelErrorCategory.RATE_LIMITED,
  ChannelErrorCategory.NETWORK_ERROR,
])

export const PERMANENT_CATEGORIES = new Set<ChannelErrorCategory>([
  ChannelErrorCategory.AUTH_FAILED,
  ChannelErrorCategory.USER_BLOCKED,
  ChannelErrorCategory.INVALID_RECIPIENT,
  ChannelErrorCategory.PERMISSION_DENIED,
  ChannelErrorCategory.PAYLOAD_INVALID,
  ChannelErrorCategory.QUOTA_EXCEEDED,
])

/**
 * Channel-agnostic finer-grained meaning of an error, assigned by each
 * integration's error mapper. Independent of {@link ChannelErrorCategory}, so
 * assigning a reason never changes retry behaviour.
 */
export const ChannelErrorReason = {
  /** The account was blocked from sending after a policy violation. */
  ACCOUNT_POLICY_BLOCKED: "account_policy_blocked",
  /** The account is temporarily restricted from sending. */
  ACCOUNT_SEND_RESTRICTED: "account_send_restricted",
  /** The provider's rate limit was hit. */
  RATE_LIMITED: "rate_limited",
} as const

export type ChannelErrorReason =
  (typeof ChannelErrorReason)[keyof typeof ChannelErrorReason]

export const channelErrorReasonValues = Object.values(ChannelErrorReason)

export type ErrorWithReason = {
  category?: string
  reason?: ChannelErrorReason
}

/** The whole account (not one recipient) may not send right now. */
export const isAccountSendBlocked = (error: ErrorWithReason): boolean =>
  error.reason === ChannelErrorReason.ACCOUNT_POLICY_BLOCKED ||
  error.reason === ChannelErrorReason.ACCOUNT_SEND_RESTRICTED

export const isRateLimited = (error: ErrorWithReason): boolean =>
  error.category === ChannelErrorCategory.RATE_LIMITED ||
  error.reason === ChannelErrorReason.RATE_LIMITED
