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
  ChannelErrorCategory.USER_BLOCKED,
  ChannelErrorCategory.INVALID_RECIPIENT,
])
