/**
 * The machine-readable `code` of every error the receiving endpoint returns,
 * in the body `{ accepted: false, code, message }`. UPPER_SNAKE_CASE like the
 * public API's own error codes (`NOT_FOUND`, `BAD_REQUEST`); senders branch on
 * the code, never on the message. Add a code here, not as a literal.
 */
export const INBOUND_WEBHOOK_ERROR_CODE = {
  invalidJson: "INVALID_JSON",
  invalidIdempotencyKey: "INVALID_IDEMPOTENCY_KEY",
  notFound: "NOT_FOUND",
  payloadTooLarge: "PAYLOAD_TOO_LARGE",
  rateLimited: "RATE_LIMITED",
  systemError: "SYSTEM_ERROR",
  webhookInactive: "WEBHOOK_INACTIVE",
  workspaceBlocked: "WORKSPACE_BLOCKED",
  workspaceUnavailable: "WORKSPACE_UNAVAILABLE",
} as const

export type InboundWebhookErrorCode =
  (typeof INBOUND_WEBHOOK_ERROR_CODE)[keyof typeof INBOUND_WEBHOOK_ERROR_CODE]
