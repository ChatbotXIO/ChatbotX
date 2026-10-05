export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
export const IDEMPOTENT_REPLAYED_HEADER = "Idempotent-Replayed"
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255
export const IDEMPOTENCY_RETENTION_HOURS = 24

/**
 * POST routes that only read (the filter body does not fit a query string).
 * They skip idempotency: replaying a stored response for up to 24 hours would
 * hand back stale rows after the data changed.
 */
export const IDEMPOTENCY_EXEMPT_READ_PATHS: ReadonlySet<string> = new Set([
  "/v1/broadcasts/audience/preview",
])
